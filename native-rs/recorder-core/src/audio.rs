//! 音频采集：麦克风 / 系统声环回（flexaudio）→ WAV
//!
//! 不用 flexaudio Mix：麦/系统分轨采集，停录后混音。暂停时丢弃采样不写入，保证与画面时间轴一致。
//! 写入侧按 wall-clock / dropped_before / PTS 空洞补静音；停录后按视频 CFR 时长强制对齐。

use crate::av_sync::align_wav_to_duration;
use crate::types::{DeviceInfo, DeviceType};
use crate::RecorderError;
use flexaudio::{
    devices as flex_devices, open, ChunkFlags, OutputFormat, SourceKind, Stream, StreamConfig,
};
use hound::{SampleFormat as WavSampleFormat, WavSpec, WavWriter};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

const TARGET_RATE: u32 = 48_000;
const TARGET_CH: u16 = 2;

/// 枚举麦克风（排除 BlackHole 等虚拟环回，避免与系统声双录）
pub fn list_mics() -> Result<Vec<DeviceInfo>, RecorderError> {
    let list = flex_devices().map_err(|e| RecorderError::Audio(e.to_string()))?;
    let mut out = Vec::new();
    for d in list
        .into_iter()
        .filter(|d| !d.is_loopback && !is_virtual_loopback_name(&d.name))
    {
        out.push(DeviceInfo {
            id: d.id,
            name: d.name,
            device_type: DeviceType::Mic,
            width: 0,
            height: 0,
            is_primary: d.is_default,
        });
    }
    if !out.is_empty() && !out.iter().any(|d| d.is_primary) {
        out[0].is_primary = true;
    }
    Ok(out)
}

/// 枚举系统输出（环回源）；附带常见虚拟声卡（作输入设备出现的）
pub fn list_system_outputs() -> Result<Vec<DeviceInfo>, RecorderError> {
    let list = flex_devices().map_err(|e| RecorderError::Audio(e.to_string()))?;
    let mut out = Vec::new();
    for d in list.iter().filter(|d| d.is_loopback) {
        out.push(DeviceInfo {
            id: d.id.clone(),
            name: d.name.clone(),
            device_type: DeviceType::SystemAudio,
            width: 0,
            height: 0,
            is_primary: d.is_default,
        });
    }
    for d in list
        .into_iter()
        .filter(|d| !d.is_loopback && is_virtual_loopback_name(&d.name))
    {
        if out
            .iter()
            .any(|x| x.id == d.id || x.id == format!("virt:{}", d.id))
        {
            continue;
        }
        out.push(DeviceInfo {
            id: format!("virt:{}", d.id),
            name: format!("{}（虚拟声卡）", d.name),
            device_type: DeviceType::SystemAudio,
            width: 0,
            height: 0,
            is_primary: false,
        });
    }
    if !out.is_empty() && !out.iter().any(|d| d.is_primary) {
        out[0].is_primary = true;
    }
    Ok(out)
}

/// 进行中的音频会话（后台线程写 WAV，结束时校正/混音到最终路径）
pub struct AudioSession {
    stop: Arc<AtomicBool>,
    joins: Vec<JoinHandle<Result<(), RecorderError>>>,
    final_path: PathBuf,
    mic_path: Option<PathBuf>,
    sys_path: Option<PathBuf>,
    samples_written: Arc<AtomicU64>,
    ffmpeg_bin: String,
    /// 采集线程启动时刻；用于相对首视频帧裁掉片头
    started_at: Instant,
}

pub struct AudioCaptureOpts {
    pub enable_mic: bool,
    pub enable_system_audio: bool,
    pub mic_device_id: Option<String>,
    pub system_device_id: Option<String>,
    pub ffmpeg_bin: String,
    /// 软暂停：为 true 时丢弃采样不写盘
    pub pause_flag: Arc<AtomicBool>,
    /// 麦克风静音：抽干队列但写 0，保持与画面时间轴对齐
    pub mic_mute_flag: Arc<AtomicBool>,
    /// 系统声静音：同上
    pub sys_mute_flag: Arc<AtomicBool>,
}

/// 麦克风 / 系统声可各自失败；两路都开不了才返回 Err
impl AudioSession {
    /// 按选项开采集；两者都关则报错。麦/系统分轨写入临时 WAV。
    pub fn start(final_wav: &Path, opts: AudioCaptureOpts) -> Result<Self, RecorderError> {
        if !opts.enable_mic && !opts.enable_system_audio {
            return Err(RecorderError::Audio("no audio source enabled".into()));
        }
        if let Some(parent) = final_wav.parent() {
            std::fs::create_dir_all(parent).map_err(RecorderError::Io)?;
        }

        let started_at = Instant::now();
        let stop = Arc::new(AtomicBool::new(false));
        let samples_written = Arc::new(AtomicU64::new(0));
        let mut joins = Vec::new();

        let mut mic_path = if opts.enable_mic {
            Some(sibling(final_wav, "mic.tmp.wav"))
        } else {
            None
        };
        let mut sys_path = if opts.enable_system_audio {
            Some(sibling(final_wav, "sys.tmp.wav"))
        } else {
            None
        };

        eprintln!(
            "[recorder-audio] start mic={} sys={} (flexaudio→{TARGET_RATE})",
            opts.enable_mic, opts.enable_system_audio
        );

        let pause_flag = Arc::clone(&opts.pause_flag);
        let mic_mute_flag = Arc::clone(&opts.mic_mute_flag);
        let sys_mute_flag = Arc::clone(&opts.sys_mute_flag);

        if let Some(path) = &mic_path {
            let _ = std::fs::remove_file(path);
            let cfg = StreamConfig {
                kind: SourceKind::Mic,
                // 禁止把虚拟声卡当麦，否则会与系统声环回叠成重音
                device_id: resolve_mic_device_id(opts.mic_device_id.as_deref()),
                output: OutputFormat {
                    sample_rate: TARGET_RATE,
                    channels: TARGET_CH,
                },
                ..Default::default()
            };
            match open(cfg) {
                Ok(stream) => {
                    joins.push(spawn_writer(
                        "recorder-mic",
                        stream,
                        path.clone(),
                        TARGET_RATE,
                        Arc::clone(&stop),
                        Arc::clone(&pause_flag),
                        Arc::clone(&mic_mute_flag),
                        Arc::clone(&samples_written),
                        None,
                    )?);
                }
                Err(e) => {
                    eprintln!("[recorder-audio] open mic failed, skip mic track: {e}");
                    let _ = std::fs::remove_file(path);
                    mic_path = None;
                }
            }
        }

        if let Some(path) = &sys_path {
            let _ = std::fs::remove_file(path);
            let want_virt = opts
                .system_device_id
                .as_deref()
                .and_then(|id| id.strip_prefix("virt:").map(|s| s.to_string()));

            let opened: Result<(Stream, &str), String> = if let Some(vid) = want_virt {
                let cfg = StreamConfig {
                    kind: SourceKind::Mic,
                    device_id: Some(vid),
                    output: OutputFormat {
                        sample_rate: TARGET_RATE,
                        channels: TARGET_CH,
                    },
                    ..Default::default()
                };
                open(cfg)
                    .map(|s| (s, "virtual-explicit"))
                    .map_err(|e| e.to_string())
            } else {
                let cfg = StreamConfig {
                    kind: SourceKind::SystemLoopback,
                    exclude_self: true,
                    device_id: opts
                        .system_device_id
                        .clone()
                        .or_else(prefer_builtin_speaker_id),
                    output: OutputFormat {
                        sample_rate: TARGET_RATE,
                        channels: TARGET_CH,
                    },
                    ..Default::default()
                };
                match open(cfg) {
                    Ok(s) => Ok((s, "system")),
                    Err(e) => {
                        eprintln!("[recorder-audio] system open failed: {e}");
                        match resolve_virtual_loopback_mic_id(None) {
                            Some(vid) => {
                                let cfg = StreamConfig {
                                    kind: SourceKind::Mic,
                                    device_id: Some(vid),
                                    output: OutputFormat {
                                        sample_rate: TARGET_RATE,
                                        channels: TARGET_CH,
                                    },
                                    ..Default::default()
                                };
                                open(cfg)
                                    .map(|s| (s, "virtual-fallback"))
                                    .map_err(|e2| {
                                        format!("virtual fallback open: {e2} (primary: {e})")
                                    })
                            }
                            None => Err(format!(
                                "system audio open failed ({e}) and no virtual loopback"
                            )),
                        }
                    }
                }
            };

            match opened {
                Ok((stream, mode)) => {
                    eprintln!("[recorder-audio] system mode={mode}");
                    // WAV 头写 48k，与 flexaudio 声明输出一致（内部 rubato 已 SRC，无需 asetrate）
                    let virt_id = resolve_virtual_loopback_mic_id(opts.system_device_id.as_deref());
                    joins.push(spawn_writer(
                        "recorder-sys",
                        stream,
                        path.clone(),
                        TARGET_RATE,
                        Arc::clone(&stop),
                        Arc::clone(&pause_flag),
                        Arc::clone(&sys_mute_flag),
                        Arc::clone(&samples_written),
                        Some(virt_id),
                    )?);
                }
                Err(e) => {
                    eprintln!("[recorder-audio] open system failed, skip sys track: {e}");
                    let _ = std::fs::remove_file(path);
                    sys_path = None;
                }
            }
        }

        if joins.is_empty() {
            return Err(RecorderError::Audio(
                "no audio track could be opened".into(),
            ));
        }

        Ok(Self {
            stop,
            joins,
            final_path: final_wav.to_path_buf(),
            mic_path,
            sys_path,
            samples_written,
            ffmpeg_bin: opts.ffmpeg_bin,
            started_at,
        })
    }

    /// 停止采集，校正系统声听感并混成最终 WAV。
    /// - `target_duration_secs`：视频 CFR 时长（frames/fps），混音后强制对齐
    /// - `first_video_at`：首帧写出时刻；用于裁掉音频早于画面的片头
    /// - `external_sys`：外部系统声 WAV（如 macOS SCK 同源轨），优先于本会话 sys 轨
    /// - `external_sys_epoch`：外部系统声时间轴起点（SCK start）；有则按此时钟裁片头，勿用麦会话 started_at
    pub fn finish(
        mut self,
        target_duration_secs: Option<f64>,
        first_video_at: Option<Instant>,
        external_sys: Option<PathBuf>,
        external_sys_epoch: Option<Instant>,
    ) -> Result<PathBuf, RecorderError> {
        self.stop.store(true, Ordering::SeqCst);
        for join in self.joins.drain(..) {
            match join.join() {
                Ok(Ok(())) => {}
                Ok(Err(e)) => return Err(e),
                Err(_) => return Err(RecorderError::Audio("audio thread panicked".into())),
            }
        }

        let n = self.samples_written.load(Ordering::Relaxed);
        let external_sys_ok = external_sys
            .as_ref()
            .map(|p| p.is_file() && p.metadata().map(|m| m.len() > 64).unwrap_or(false))
            .unwrap_or(false);
        if n < 4800 && !external_sys_ok {
            return Err(RecorderError::Audio(format!(
                "almost no audio samples ({n}). macOS: System Settings → Privacy → Audio / Screen & System Audio Recording；或安装 BlackHole 并把系统输出切过去"
            )));
        }

        let mic = self.mic_path.as_ref().filter(|p| p.is_file());
        // SCK 等外部系统声优先；否则用 flexaudio 环回轨
        let external_sys_owned = external_sys.filter(|p| p.is_file());
        let using_external_sys = external_sys_owned.is_some() && external_sys_epoch.is_some();
        if external_sys_owned.is_some() {
            eprintln!("[recorder-audio] using external system wav (SCK)");
        }
        let sys_owned = external_sys_owned.or_else(|| {
            self.sys_path
                .as_ref()
                .filter(|p| p.is_file())
                .cloned()
        });
        let sys = sys_owned.as_ref();

        // 系统轨：flexaudio 输出已是可播放的 48k；仅轻微提亮/提响，改善环回听感
        let sys_fixed = if let Some(sys_path) = sys {
            let fixed = sibling(&self.final_path, "sys48.tmp.wav");
            brighten_sys_wav(&self.ffmpeg_bin, sys_path, &fixed)?;
            Some(fixed)
        } else {
            None
        };

        // SCK 等外部系统声与画面同源：片头按 external_sys_epoch 裁，不能用麦会话 started_at
        // （否则会多裁 ~1s 真实系统声，对齐后再在片尾补静音 →「提前没声」）
        let mic_lead_secs = first_video_at
            .map(|t| t.saturating_duration_since(self.started_at).as_secs_f64())
            .unwrap_or(0.0);
        let sys_lead_secs = match (first_video_at, external_sys_epoch) {
            (Some(fv), Some(epoch)) => fv.saturating_duration_since(epoch).as_secs_f64(),
            _ => 0.0,
        };

        if using_external_sys {
            if let Some(s) = sys_fixed.as_ref() {
                if sys_lead_secs > 0.02 {
                    eprintln!(
                        "[recorder-audio] SCK sys lead trim {sys_lead_secs:.3}s (epoch→first video)"
                    );
                    crate::av_sync::trim_wav_lead(&self.ffmpeg_bin, s, sys_lead_secs)?;
                }
            }
            if let Some(m) = mic {
                if mic_lead_secs > 0.02 {
                    eprintln!(
                        "[recorder-audio] mic lead trim {mic_lead_secs:.3}s (align to first video)"
                    );
                    crate::av_sync::trim_wav_lead(&self.ffmpeg_bin, m, mic_lead_secs)?;
                }
            }
        }

        let mut mic_aec: Option<PathBuf> = None;
        match (mic, sys_fixed.as_ref()) {
            (Some(m), Some(s)) => {
                // 麦+系统同时开：先消外放漏进麦的回声，再混音（耳机无漏音时自动跳过）
                let aec_path = sibling(&self.final_path, "mic.aec.tmp.wav");
                let mic_for_mix = match crate::aec::cancel_system_echo_from_mic(m, s, &aec_path) {
                    Ok(true) => {
                        mic_aec = Some(aec_path);
                        mic_aec.as_ref().unwrap().as_path()
                    }
                    Ok(false) => m.as_path(),
                    Err(e) => {
                        eprintln!("[recorder-audio] aec failed, mix raw mic: {e}");
                        let _ = std::fs::remove_file(&aec_path);
                        m.as_path()
                    }
                };
                mix_wavs(&self.ffmpeg_bin, mic_for_mix, s, &self.final_path)?;
            }
            (Some(m), None) => {
                std::fs::copy(m, &self.final_path).map_err(RecorderError::Io)?;
            }
            (None, Some(s)) => {
                std::fs::copy(s, &self.final_path).map_err(RecorderError::Io)?;
            }
            (None, None) => {
                return Err(RecorderError::Audio("no audio files produced".into()));
            }
        }

        // flexaudio 同源环回：混音后再裁片头；SCK 外部轨已在分轨阶段裁过
        if !using_external_sys && mic_lead_secs > 0.02 {
            crate::av_sync::trim_wav_lead(&self.ffmpeg_bin, &self.final_path, mic_lead_secs)?;
        }
        if let Some(target) = target_duration_secs {
            align_wav_to_duration(&self.ffmpeg_bin, &self.final_path, target, 0.02)?;
        }

        // 清理分轨临时文件
        for p in [
            self.mic_path.as_ref(),
            self.sys_path.as_ref(),
            sys_owned.as_ref(),
            sys_fixed.as_ref(),
            mic_aec.as_ref(),
        ]
        .into_iter()
        .flatten()
        {
            if *p != self.final_path {
                let _ = std::fs::remove_file(p);
            }
        }

        Ok(self.final_path)
    }
}

/// 无麦会话：外部系统声（SCK）提亮 + 片头裁切 + 时长对齐 → 最终 WAV
pub fn finalize_external_sys_wav(
    ffmpeg_bin: &str,
    sys: &Path,
    final_wav: &Path,
    target_duration_secs: Option<f64>,
    first_video_at: Option<Instant>,
    sys_epoch: Option<Instant>,
) -> Result<PathBuf, RecorderError> {
    let bright = sibling(final_wav, "sys48.tmp.wav");
    brighten_sys_wav(ffmpeg_bin, sys, &bright)?;
    std::fs::rename(&bright, final_wav).or_else(|_| {
        std::fs::copy(&bright, final_wav).and_then(|_| std::fs::remove_file(&bright))
    }).map_err(RecorderError::Io)?;

    if let (Some(fv), Some(epoch)) = (first_video_at, sys_epoch) {
        let lead = fv.saturating_duration_since(epoch).as_secs_f64();
        if lead > 0.02 {
            eprintln!("[recorder-audio] external sys lead trim {lead:.3}s");
            crate::av_sync::trim_wav_lead(ffmpeg_bin, final_wav, lead)?;
        }
    }
    if let Some(target) = target_duration_secs {
        align_wav_to_duration(ffmpeg_bin, final_wav, target, 0.02)?;
    }
    let _ = std::fs::remove_file(sys);
    Ok(final_wav.to_path_buf())
}

fn spawn_writer(
    name: &str,
    mut stream: Stream,
    path: PathBuf,
    header_rate: u32,
    stop: Arc<AtomicBool>,
    pause: Arc<AtomicBool>,
    mute: Arc<AtomicBool>,
    samples_written: Arc<AtomicU64>,
    virt_fallback_id: Option<Option<String>>,
) -> Result<JoinHandle<Result<(), RecorderError>>, RecorderError> {
    stream
        .start()
        .map_err(|e| RecorderError::Audio(format!("start {name}: {e}")))?;

    let allow_virt_fallback = virt_fallback_id.is_some();
    let virt_id = virt_fallback_id.and_then(|x| x);
    let rate = header_rate.max(1);
    let name_owned = name.to_string();

    thread::Builder::new()
        .name(name.into())
        .spawn(move || {
            let name = name_owned.as_str();
            let make_writer = |rate: u32| -> Result<_, RecorderError> {
                let spec = WavSpec {
                    channels: TARGET_CH,
                    sample_rate: rate.max(1),
                    bits_per_sample: 16,
                    sample_format: WavSampleFormat::Int,
                };
                WavWriter::create(&path, spec)
                    .map_err(|e| RecorderError::Audio(format!("create wav: {e}")))
            };
            let mut writer = make_writer(rate)?;
            let started_at = Instant::now();
            let mut switched = false;
            // 本轨采样计数（交织样本数，含补静音）
            let track_samples = AtomicU64::new(0);
            let mut pause_total = Duration::ZERO;
            let mut pause_at: Option<Instant> = None;
            let mut saw_first_chunk = false;
            let mut last_dropped: u32 = 0;
            let mut last_pts_ns: Option<i64> = None;
            let mut gap_silence_frames: u64 = 0;

            // 写若干帧静音（1 帧 = 全部声道各 1 个采样）
            let write_silence_frames =
                |writer: &mut hound::WavWriter<std::io::BufWriter<std::fs::File>>,
                 frames: u64,
                 samples_written: &AtomicU64,
                 track_samples: &AtomicU64|
                 -> Result<(), RecorderError> {
                    if frames == 0 {
                        return Ok(());
                    }
                    let n = frames.saturating_mul(TARGET_CH as u64);
                    for _ in 0..n {
                        writer
                            .write_sample(0i16)
                            .map_err(|e| RecorderError::Audio(format!("write silence: {e}")))?;
                    }
                    samples_written.fetch_add(n, Ordering::Relaxed);
                    track_samples.fetch_add(n, Ordering::Relaxed);
                    Ok(())
                };

            // 未暂停墙钟应对齐的帧数
            let expected_frames = |pause_total: Duration, pause_at: Option<Instant>| -> u64 {
                let mut active = started_at.elapsed().saturating_sub(pause_total);
                if let Some(at) = pause_at {
                    active = active.saturating_sub(at.elapsed());
                }
                (active.as_secs_f64() * f64::from(rate)).round() as u64
            };

            while !stop.load(Ordering::SeqCst) {
                let paused = pause.load(Ordering::SeqCst);
                if paused {
                    if pause_at.is_none() {
                        pause_at = Some(Instant::now());
                    }
                } else if let Some(at) = pause_at.take() {
                    pause_total += at.elapsed();
                }

                let muted = mute.load(Ordering::SeqCst);
                let mut got = false;
                while let Some(chunk) = stream.poll_chunk() {
                    got = true;
                    let ch = TARGET_CH as usize;
                    if ch == 0 || chunk.data.len() % ch != 0 {
                        continue;
                    }
                    // 暂停：抽干队列不写盘；仍推进 PTS/dropped 游标，避免恢复时把暂停当断流补静音
                    if paused {
                        if chunk.dropped_before > last_dropped {
                            last_dropped = chunk.dropped_before;
                        }
                        last_pts_ns = Some(chunk.pts_ns);
                        continue;
                    }

                    let frames = if chunk.frames > 0 {
                        chunk.frames as u64
                    } else {
                        (chunk.data.len() / ch) as u64
                    };

                    // Process Tap 启动空窗 / 首包延迟：按未暂停墙钟在首包前补静音
                    if !saw_first_chunk {
                        saw_first_chunk = true;
                        let lead = expected_frames(pause_total, None);
                        if lead > frames {
                            let pad = lead - frames;
                            write_silence_frames(
                                &mut writer,
                                pad,
                                &samples_written,
                                &track_samples,
                            )?;
                            gap_silence_frames += pad;
                            eprintln!(
                                "[recorder-audio] {name} lead silence {pad} frames ({:.0}ms)",
                                pad as f64 * 1000.0 / f64::from(rate)
                            );
                        }
                    }

                    // DROP_OLDEST：按累计 dropped_before 增量补整块静音
                    if chunk.dropped_before > last_dropped {
                        let delta = u64::from(chunk.dropped_before - last_dropped);
                        let pad = delta.saturating_mul(frames.max(1));
                        write_silence_frames(&mut writer, pad, &samples_written, &track_samples)?;
                        gap_silence_frames += pad;
                        eprintln!(
                            "[recorder-audio] {name} dropped_before +{delta} → silence {pad} frames"
                        );
                    }
                    last_dropped = chunk.dropped_before;

                    // 断流/恢复标记：用 PTS 空洞补静音（与 dropped 互补，避免双计过大）
                    if chunk.flags.contains(ChunkFlags::DISCONTINUITY)
                        || chunk.flags.contains(ChunkFlags::RECOVERED)
                    {
                        if let Some(prev) = last_pts_ns {
                            let ns_per_frame = 1_000_000_000i64 / i64::from(rate);
                            let expected_pts = prev + frames as i64 * ns_per_frame;
                            let gap_ns = chunk.pts_ns - expected_pts;
                            // 超过半块才补，过滤正常抖动
                            if gap_ns > ns_per_frame * (frames as i64 / 2).max(1) {
                                let pad =
                                    ((gap_ns as f64) * f64::from(rate) / 1_000_000_000.0).round()
                                        as u64;
                                if pad > 0 {
                                    write_silence_frames(
                                        &mut writer,
                                        pad,
                                        &samples_written,
                                        &track_samples,
                                    )?;
                                    gap_silence_frames += pad;
                                    eprintln!(
                                        "[recorder-audio] {name} pts gap silence {pad} frames"
                                    );
                                }
                            }
                        }
                    }
                    last_pts_ns = Some(chunk.pts_ns);

                    // 静音：写 0 保持轨长与画面对齐，可随时再打开
                    if muted {
                        write_silence_frames(
                            &mut writer,
                            frames,
                            &samples_written,
                            &track_samples,
                        )?;
                        continue;
                    }
                    for &s in &chunk.data {
                        let s = s.clamp(-1.0, 1.0);
                        let v = (s * f32::from(i16::MAX)) as i16;
                        writer
                            .write_sample(v)
                            .map_err(|e| RecorderError::Audio(format!("write: {e}")))?;
                    }
                    let n = chunk.data.len() as u64;
                    samples_written.fetch_add(n, Ordering::Relaxed);
                    track_samples.fetch_add(n, Ordering::Relaxed);
                }
                while stream.poll_event().is_some() {}

                // 空闲且未暂停：按墙钟补欠载（无 chunk 的静音段 / 消费滞后）
                if !got && !paused && saw_first_chunk {
                    let have = track_samples.load(Ordering::Relaxed) / u64::from(TARGET_CH);
                    let want = expected_frames(pause_total, pause_at);
                    // 容许约 40ms 抖动，避免忙等刷静音
                    let slack = u64::from(rate) / 25;
                    if want > have.saturating_add(slack) {
                        let pad = want - have;
                        write_silence_frames(
                            &mut writer,
                            pad,
                            &samples_written,
                            &track_samples,
                        )?;
                        gap_silence_frames += pad;
                    }
                }

                // Process Tap 无权限时常 0 采样：约 1.2s 后切到虚拟声卡
                if allow_virt_fallback
                    && !switched
                    && track_samples.load(Ordering::Relaxed) == 0
                    && started_at.elapsed() > Duration::from_millis(1200)
                {
                    if let Some(vid) = virt_id.clone() {
                        eprintln!(
                            "[recorder-audio] no samples from process-tap, fallback to virtual mic {vid}"
                        );
                        stream.stop();
                        let cfg = StreamConfig {
                            kind: SourceKind::Mic,
                            device_id: Some(vid),
                            output: OutputFormat {
                                sample_rate: TARGET_RATE,
                                channels: TARGET_CH,
                            },
                            ..Default::default()
                        };
                        match open(cfg).and_then(|mut s| {
                            s.start()?;
                            Ok(s)
                        }) {
                            Ok(s) => {
                                stream = s;
                                // 尚无采样：按 48k 重建 WAV 头；保留 started_at，首包再补前导静音
                                drop(writer);
                                let _ = std::fs::remove_file(&path);
                                writer = make_writer(TARGET_RATE)?;
                                saw_first_chunk = false;
                                last_dropped = 0;
                                last_pts_ns = None;
                                switched = true;
                            }
                            Err(e) => {
                                eprintln!("[recorder-audio] virtual fallback failed: {e}");
                                switched = true;
                            }
                        }
                    } else {
                        switched = true;
                    }
                }

                if !got {
                    thread::sleep(Duration::from_millis(5));
                }
            }
            stream.stop();

            // 停录前再按墙钟补齐尾部欠载
            if !pause.load(Ordering::SeqCst) {
                if let Some(at) = pause_at.take() {
                    pause_total += at.elapsed();
                }
                let have = track_samples.load(Ordering::Relaxed) / u64::from(TARGET_CH);
                let want = expected_frames(pause_total, None);
                if want > have {
                    let pad = want - have;
                    write_silence_frames(&mut writer, pad, &samples_written, &track_samples)?;
                    gap_silence_frames += pad;
                }
            }

            if gap_silence_frames > 0 {
                eprintln!(
                    "[recorder-audio] {name} total gap silence={gap_silence_frames} frames ({:.0}ms)",
                    gap_silence_frames as f64 * 1000.0 / f64::from(rate)
                );
            }

            writer
                .finalize()
                .map_err(|e| RecorderError::Audio(format!("finalize wav: {e}")))?;
            Ok(())
        })
        .map_err(|e| RecorderError::Internal(format!("spawn {name}: {e}")))
}

/// 系统声：轻微提亮/提响（环回常偏闷偏小），不做采样率改写
fn brighten_sys_wav(ffmpeg_bin: &str, input: &Path, output: &Path) -> Result<(), RecorderError> {
    let out = Command::new(ffmpeg_bin)
        .args(["-hide_banner", "-y", "-i"])
        .arg(input.as_os_str())
        .args([
            "-af",
            "highshelf=f=5000:g=1.8,volume=1.1,alimiter=limit=0.98:level=false",
            "-c:a",
            "pcm_s16le",
            "-ar",
            "48000",
            "-ac",
            "2",
        ])
        .arg(output.as_os_str())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| RecorderError::Audio(format!("brighten spawn: {e}")))?;
    if !out.status.success() {
        // 滤镜失败则原样拷贝，保证不停录
        std::fs::copy(input, output).map_err(RecorderError::Io)?;
    }
    Ok(())
}

fn mix_wavs(ffmpeg_bin: &str, mic: &Path, sys: &Path, output: &Path) -> Result<(), RecorderError> {
    let out = Command::new(ffmpeg_bin)
        .args(["-hide_banner", "-y", "-i"])
        .arg(mic.as_os_str())
        .arg("-i")
        .arg(sys.as_os_str())
        .args([
            "-filter_complex",
            "[0:a]volume=0.95[a0];[1:a]volume=1.0[a1];[a0][a1]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.98:level=false[a]",
            "-map",
            "[a]",
            "-c:a",
            "pcm_s16le",
            "-ar",
            "48000",
            "-ac",
            "2",
        ])
        .arg(output.as_os_str())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| RecorderError::Audio(format!("amix spawn: {e}")))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(RecorderError::Audio(format!("amix failed: {err}")));
    }
    Ok(())
}

fn sibling(path: &Path, suffix: &str) -> PathBuf {
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("audio");
    path.with_file_name(format!("{stem}.{suffix}"))
}

/// 优先本机扬声器做系统声环回（蓝牙耳机环回常发闷、断续）
fn prefer_builtin_speaker_id() -> Option<String> {
    let list = flex_devices().ok()?;
    let speakers: Vec<_> = list.into_iter().filter(|d| d.is_loopback).collect();
    for d in &speakers {
        let n = d.name.to_ascii_lowercase();
        if (n.contains("macbook")
            || n.contains("imac")
            || n.contains("内置")
            || n.contains("built-in")
            || n.contains("扬声器"))
            && !n.contains("airpods")
            && !n.contains("bluetooth")
            && !n.contains("headphone")
        {
            return Some(d.id.clone());
        }
    }
    for d in &speakers {
        let n = d.name.to_ascii_lowercase();
        if d.is_default
            && !n.contains("airpods")
            && !n.contains("bluetooth")
            && !n.contains("headphone")
        {
            return Some(d.id.clone());
        }
    }
    None
}

fn prefer_builtin_mic_id() -> Option<String> {
    let list = flex_devices().ok()?;
    let mics: Vec<_> = list
        .into_iter()
        .filter(|d| !d.is_loopback && !is_virtual_loopback_name(&d.name))
        .collect();
    for d in &mics {
        let n = d.name.to_ascii_lowercase();
        if (n.contains("macbook")
            || n.contains("imac")
            || n.contains("内置")
            || n.contains("built-in"))
            && !n.contains("airpods")
        {
            return Some(d.id.clone());
        }
    }
    mics.first().map(|d| d.id.clone())
}

/// 解析麦设备：虚拟环回不可作麦，回退内置麦
fn resolve_mic_device_id(preferred: Option<&str>) -> Option<String> {
    if let Some(id) = preferred {
        if let Ok(list) = flex_devices() {
            if let Some(d) = list.iter().find(|d| d.id == id) {
                if !d.is_loopback && !is_virtual_loopback_name(&d.name) {
                    return Some(id.to_string());
                }
                eprintln!(
                    "[recorder-audio] mic device {:?} is virtual/loopback, fall back to builtin",
                    d.name
                );
            }
        }
    }
    prefer_builtin_mic_id()
}

fn resolve_virtual_loopback_mic_id(preferred: Option<&str>) -> Option<String> {
    if let Some(id) = preferred {
        if let Some(raw) = id.strip_prefix("virt:") {
            return Some(raw.to_string());
        }
    }
    let list = flex_devices().ok()?;
    for d in list {
        if !d.is_loopback && is_virtual_loopback_name(&d.name) {
            return Some(d.id);
        }
    }
    None
}

fn is_virtual_loopback_name(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    n.contains("blackhole")
        || n.contains("orayvirtual")
        || n.contains("soundflower")
        || n.contains("loopback")
        || n.contains("vb-cable")
        || n.contains("cable input")
}
