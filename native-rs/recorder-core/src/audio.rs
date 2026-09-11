//! 音频采集：麦克风 / 系统声环回（flexaudio）→ WAV
//!
//! 不用 flexaudio Mix：麦/系统分轨采集，停录后混音。暂停时丢弃采样不写入，保证与画面时间轴一致。

use crate::types::{DeviceInfo, DeviceType};
use crate::RecorderError;
use flexaudio::{devices as flex_devices, open, OutputFormat, SourceKind, Stream, StreamConfig};
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
    /// 已切到虚拟声卡输入时置位
    sys_used_virt: Arc<AtomicBool>,
    samples_written: Arc<AtomicU64>,
    ffmpeg_bin: String,
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

        let stop = Arc::new(AtomicBool::new(false));
        let samples_written = Arc::new(AtomicU64::new(0));
        let sys_used_virt = Arc::new(AtomicBool::new(false));
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

        let sys_hw_rate = resolve_system_hw_rate(opts.system_device_id.as_deref());
        eprintln!(
            "[recorder-audio] start mic={} sys={} sys_hw_rate={sys_hw_rate}",
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
                sys_used_virt.store(true, Ordering::SeqCst);
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
                                sys_used_virt.store(true, Ordering::SeqCst);
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
                    // WAV 头仍写 48k（与 flexaudio 输出声明一致）；停录后用 asetrate 按 HW 率校正音高
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
                        Some(Arc::clone(&sys_used_virt)),
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
            sys_used_virt,
            samples_written,
            ffmpeg_bin: opts.ffmpeg_bin,
        })
    }

    /// 停止采集，校正系统声采样率并混成最终 WAV
    pub fn finish(mut self) -> Result<PathBuf, RecorderError> {
        self.stop.store(true, Ordering::SeqCst);
        for join in self.joins.drain(..) {
            match join.join() {
                Ok(Ok(())) => {}
                Ok(Err(e)) => return Err(e),
                Err(_) => return Err(RecorderError::Audio("audio thread panicked".into())),
            }
        }

        let n = self.samples_written.load(Ordering::Relaxed);
        if n < 4800 {
            return Err(RecorderError::Audio(format!(
                "almost no audio samples ({n}). macOS: System Settings → Privacy → Audio / Screen & System Audio Recording；或安装 BlackHole 并把系统输出切过去"
            )));
        }

        let used_virt = self.sys_used_virt.load(Ordering::SeqCst);
        if used_virt {
            eprintln!("[recorder-audio] system path used virtual device fallback");
        }

        let mic = self.mic_path.as_ref().filter(|p| p.is_file());
        let sys = self.sys_path.as_ref().filter(|p| p.is_file());

        // 系统轨：flexaudio 输出已是可播放的 48k；仅轻微提亮/提响，改善环回听感
        let sys_fixed = if let Some(sys_path) = sys {
            let fixed = sibling(&self.final_path, "sys48.tmp.wav");
            brighten_sys_wav(&self.ffmpeg_bin, sys_path, &fixed)?;
            Some(fixed)
        } else {
            None
        };

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

        // 清理分轨临时文件
        for p in [
            self.mic_path.as_ref(),
            self.sys_path.as_ref(),
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
    used_virt_flag: Option<Arc<AtomicBool>>,
) -> Result<JoinHandle<Result<(), RecorderError>>, RecorderError> {
    stream
        .start()
        .map_err(|e| RecorderError::Audio(format!("start {name}: {e}")))?;

    let allow_virt_fallback = virt_fallback_id.is_some();
    let virt_id = virt_fallback_id.and_then(|x| x);

    thread::Builder::new()
        .name(name.into())
        .spawn(move || {
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
            let mut writer = make_writer(header_rate)?;
            let started_at = Instant::now();
            let mut switched = false;
            // 本轨采样计数（用于判断 Process Tap 是否无数据）
            let track_samples = AtomicU64::new(0);

            while !stop.load(Ordering::SeqCst) {
                let paused = pause.load(Ordering::SeqCst);
                let muted = mute.load(Ordering::SeqCst);
                let mut got = false;
                while let Some(chunk) = stream.poll_chunk() {
                    got = true;
                    let ch = TARGET_CH as usize;
                    if ch == 0 || chunk.data.len() % ch != 0 {
                        continue;
                    }
                    // 暂停：抽干队列但不写盘，避免继续后音画错位
                    if paused {
                        continue;
                    }
                    samples_written.fetch_add(chunk.data.len() as u64, Ordering::Relaxed);
                    track_samples.fetch_add(chunk.data.len() as u64, Ordering::Relaxed);
                    // 静音：写 0 保持轨长与画面对齐，可随时再打开
                    if muted {
                        for _ in 0..chunk.data.len() {
                            writer
                                .write_sample(0i16)
                                .map_err(|e| RecorderError::Audio(format!("write: {e}")))?;
                        }
                        continue;
                    }
                    for &s in &chunk.data {
                        // 轻微 headroom，避免无谓压低导致发闷、偏小
                        let s = s.clamp(-1.0, 1.0);
                        let v = (s * f32::from(i16::MAX)) as i16;
                        writer
                            .write_sample(v)
                            .map_err(|e| RecorderError::Audio(format!("write: {e}")))?;
                    }
                }
                while stream.poll_event().is_some() {}

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
                                if let Some(flag) = &used_virt_flag {
                                    flag.store(true, Ordering::SeqCst);
                                }
                                // 尚无采样：按 48k 重建 WAV 头（虚拟声卡通常为 48k）
                                drop(writer);
                                let _ = std::fs::remove_file(&path);
                                writer = make_writer(TARGET_RATE)?;
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

/// 读取环回输出设备真实采样率（本机扬声器常见 44100）
fn resolve_system_hw_rate(preferred: Option<&str>) -> u32 {
    let list = match flex_devices() {
        Ok(l) => l,
        Err(_) => return TARGET_RATE,
    };
    if let Some(id) = preferred {
        if let Some(raw) = id.strip_prefix("virt:") {
            if let Some(d) = list.iter().find(|d| d.id == raw) {
                return if d.sample_rate > 0 {
                    d.sample_rate
                } else {
                    TARGET_RATE
                };
            }
            return TARGET_RATE;
        }
        if let Some(d) = list.iter().find(|d| d.id == id) {
            return if d.sample_rate > 0 {
                d.sample_rate
            } else {
                TARGET_RATE
            };
        }
    }
    if let Some(id) = prefer_builtin_speaker_id() {
        if let Some(d) = list.iter().find(|d| d.id == id) {
            if d.sample_rate > 0 {
                return d.sample_rate;
            }
        }
    }
    list.iter()
        .find(|d| d.is_loopback && d.is_default && d.sample_rate > 0)
        .map(|d| d.sample_rate)
        .unwrap_or(TARGET_RATE)
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
