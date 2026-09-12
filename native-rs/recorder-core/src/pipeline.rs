//! 录制生命周期：启停、软暂停/继续、采集线程、事件回调

use crate::audio::{AudioCaptureOpts, AudioSession};
use crate::capture_clock::CaptureClock;
use crate::crop::crop_rgba;
use crate::encoder::{
    finalize_video_only, mux_video_audio, resolve_ffmpeg, sibling_temp, FfmpegEncoder,
};
use crate::screen::resolve_monitor;
use crate::types::{RecordConfig, RecordRegion, RecorderEvent, RecorderState, VideoQuality};
use crate::RecorderError;
use std::borrow::Cow;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

pub type EventCallback = Arc<dyn Fn(RecorderEvent) + Send + Sync + 'static>;

/// 录屏调度器（线程安全）
pub struct Recorder {
    inner: Mutex<RecorderInner>,
}

struct RecorderInner {
    state: RecorderState,
    stop_flag: Option<Arc<AtomicBool>>,
    pause_flag: Option<Arc<AtomicBool>>,
    /// true = 写静音；开录时按 enable_mic 取反
    mic_mute_flag: Option<Arc<AtomicBool>>,
    /// true = 写静音；开录时按 enable_system_audio 取反
    sys_mute_flag: Option<Arc<AtomicBool>>,
    join: Option<JoinHandle<()>>,
    on_event: Option<EventCallback>,
}

impl Default for Recorder {
    fn default() -> Self {
        Self::new()
    }
}

impl Recorder {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(RecorderInner {
                state: RecorderState::Idle,
                stop_flag: None,
                pause_flag: None,
                mic_mute_flag: None,
                sys_mute_flag: None,
                join: None,
                on_event: None,
            }),
        }
    }

    pub fn set_event_callback(&self, cb: EventCallback) {
        if let Ok(mut g) = self.inner.lock() {
            g.on_event = Some(cb);
        }
    }

    pub fn state(&self) -> RecorderState {
        self.inner
            .lock()
            .map(|g| g.state)
            .unwrap_or(RecorderState::Idle)
    }

    /// 开始录制（非阻塞）
    pub fn start(&self, config: RecordConfig) -> Result<(), RecorderError> {
        if config.output_path.trim().is_empty() {
            return Err(RecorderError::InvalidConfig("outputPath required".into()));
        }
        let fps = if config.fps == 0 { 30 } else { config.fps.min(60) };

        let mut g = self
            .inner
            .lock()
            .map_err(|_| RecorderError::Internal("lock poisoned".into()))?;
        if g.state != RecorderState::Idle {
            return Err(RecorderError::AlreadyRecording);
        }

        let monitor = resolve_monitor(config.screen_id.as_deref())?;
        let ffmpeg_bin = resolve_ffmpeg(config.ffmpeg_path.as_deref())?;
        let output = PathBuf::from(&config.output_path);
        let mic_device_id = config.mic_device_id.clone();
        let system_device_id = config.system_device_id.clone();
        let region = config.region.filter(|r| r.width >= 2 && r.height >= 2);
        let quality = config.quality;

        let stop_flag = Arc::new(AtomicBool::new(false));
        let pause_flag = Arc::new(AtomicBool::new(false));
        // 两路都开采集，初始静音 = 用户关了该源；录制中可再打开
        let mic_mute_flag = Arc::new(AtomicBool::new(!config.enable_mic));
        let sys_mute_flag = Arc::new(AtomicBool::new(!config.enable_system_audio));
        let stop_flag_t = Arc::clone(&stop_flag);
        let pause_flag_t = Arc::clone(&pause_flag);
        let mic_mute_t = Arc::clone(&mic_mute_flag);
        let sys_mute_t = Arc::clone(&sys_mute_flag);
        let on_event = g.on_event.clone();

        emit(
            &on_event,
            RecorderEvent::StateChanged {
                state: RecorderState::Recording,
            },
        );

        let join = thread::Builder::new()
            .name("recorder-capture".into())
            .spawn(move || {
                if let Err(e) = capture_loop(
                    monitor,
                    fps,
                    quality,
                    mic_device_id,
                    system_device_id,
                    region,
                    &ffmpeg_bin,
                    &output,
                    stop_flag_t,
                    pause_flag_t,
                    mic_mute_t,
                    sys_mute_t,
                    on_event.clone(),
                ) {
                    emit(
                        &on_event,
                        RecorderEvent::Error {
                            message: e.to_string(),
                        },
                    );
                }
            })
            .map_err(|e| RecorderError::Internal(format!("spawn capture thread: {e}")))?;

        g.state = RecorderState::Recording;
        g.stop_flag = Some(stop_flag);
        g.pause_flag = Some(pause_flag);
        g.mic_mute_flag = Some(mic_mute_flag);
        g.sys_mute_flag = Some(sys_mute_flag);
        g.join = Some(join);
        Ok(())
    }

    /// 软暂停：停止写入音画，成片时间轴不推进
    pub fn pause(&self) -> Result<(), RecorderError> {
        let mut g = self
            .inner
            .lock()
            .map_err(|_| RecorderError::Internal("lock poisoned".into()))?;
        match g.state {
            RecorderState::Paused => Ok(()),
            RecorderState::Recording => {
                if let Some(p) = &g.pause_flag {
                    p.store(true, Ordering::SeqCst);
                }
                g.state = RecorderState::Paused;
                emit(
                    &g.on_event,
                    RecorderEvent::StateChanged {
                        state: RecorderState::Paused,
                    },
                );
                Ok(())
            }
            _ => Err(RecorderError::NotRecording),
        }
    }

    /// 从暂停恢复写入
    pub fn resume(&self) -> Result<(), RecorderError> {
        let mut g = self
            .inner
            .lock()
            .map_err(|_| RecorderError::Internal("lock poisoned".into()))?;
        match g.state {
            RecorderState::Recording => Ok(()),
            RecorderState::Paused => {
                if let Some(p) = &g.pause_flag {
                    p.store(false, Ordering::SeqCst);
                }
                g.state = RecorderState::Recording;
                emit(
                    &g.on_event,
                    RecorderEvent::StateChanged {
                        state: RecorderState::Recording,
                    },
                );
                Ok(())
            }
            _ => Err(RecorderError::NotPaused),
        }
    }

    /// 录制中实时开关麦克风（关=写静音，开=写真实采样）
    pub fn set_mic_enabled(&self, enabled: bool) -> Result<(), RecorderError> {
        let g = self
            .inner
            .lock()
            .map_err(|_| RecorderError::Internal("lock poisoned".into()))?;
        if g.state != RecorderState::Recording && g.state != RecorderState::Paused {
            return Err(RecorderError::NotRecording);
        }
        if let Some(flag) = &g.mic_mute_flag {
            flag.store(!enabled, Ordering::SeqCst);
        }
        Ok(())
    }

    /// 录制中实时开关系统声（关=写静音，开=写真实采样）
    pub fn set_system_audio_enabled(&self, enabled: bool) -> Result<(), RecorderError> {
        let g = self
            .inner
            .lock()
            .map_err(|_| RecorderError::Internal("lock poisoned".into()))?;
        if g.state != RecorderState::Recording && g.state != RecorderState::Paused {
            return Err(RecorderError::NotRecording);
        }
        if let Some(flag) = &g.sys_mute_flag {
            flag.store(!enabled, Ordering::SeqCst);
        }
        Ok(())
    }

    /// 停止录制并等待采集线程退出（录制中或暂停中均可）
    pub fn stop(&self) -> Result<(), RecorderError> {
        let (flag, pause, join, on_event) = {
            let mut g = self
                .inner
                .lock()
                .map_err(|_| RecorderError::Internal("lock poisoned".into()))?;
            if g.state != RecorderState::Recording && g.state != RecorderState::Paused {
                return Err(RecorderError::NotRecording);
            }
            g.state = RecorderState::Stopping;
            emit(
                &g.on_event,
                RecorderEvent::StateChanged {
                    state: RecorderState::Stopping,
                },
            );
            (
                g.stop_flag.take(),
                g.pause_flag.take(),
                g.join.take(),
                g.on_event.clone(),
            )
        };

        // 先解除暂停再停，避免采集线程卡在暂停分支
        if let Some(p) = pause {
            p.store(false, Ordering::SeqCst);
        }
        if let Some(flag) = flag {
            flag.store(true, Ordering::SeqCst);
        }
        if let Some(join) = join {
            let _ = join.join();
        }

        if let Ok(mut g) = self.inner.lock() {
            g.state = RecorderState::Idle;
            g.stop_flag = None;
            g.pause_flag = None;
            g.mic_mute_flag = None;
            g.sys_mute_flag = None;
            g.join = None;
        }
        emit(
            &on_event,
            RecorderEvent::StateChanged {
                state: RecorderState::Idle,
            },
        );
        Ok(())
    }
}

fn emit(cb: &Option<EventCallback>, event: RecorderEvent) {
    if let Some(f) = cb {
        f(event);
    }
}

/// 整屏或按 region 裁剪；整屏偶数边可零拷贝借用
fn frame_pixels<'a>(
    width: u32,
    height: u32,
    rgba: &'a [u8],
    region: Option<RecordRegion>,
) -> Option<(u32, u32, Cow<'a, [u8]>)> {
    if let Some(r) = region {
        let (w, h, buf) = crop_rgba(rgba, width, height, r)?;
        return Some((w, h, Cow::Owned(buf)));
    }
    let w = width & !1;
    let h = height & !1;
    if w < 2 || h < 2 {
        return None;
    }
    let need = (w as usize).saturating_mul(h as usize).saturating_mul(4);
    if rgba.len() < (width as usize).saturating_mul(height as usize).saturating_mul(4) {
        return None;
    }
    if w == width && h == height {
        return Some((w, h, Cow::Borrowed(&rgba[..need])));
    }
    let (cw, ch, buf) = crop_rgba(
        rgba,
        width,
        height,
        RecordRegion {
            x: 0,
            y: 0,
            width: w,
            height: h,
        },
    )?;
    Some((cw, ch, Cow::Owned(buf)))
}

/// 画面 + 麦克风/系统声（两路都开，静音标志控制是否写真实采样）；先写临时视频/音频，停录后再混流
#[allow(clippy::too_many_arguments)]
fn capture_loop(
    monitor: xcap::Monitor,
    fps: u32,
    quality: VideoQuality,
    mic_device_id: Option<String>,
    system_device_id: Option<String>,
    region: Option<RecordRegion>,
    ffmpeg_bin: &str,
    output: &PathBuf,
    stop_flag: Arc<AtomicBool>,
    pause_flag: Arc<AtomicBool>,
    mic_mute_flag: Arc<AtomicBool>,
    sys_mute_flag: Arc<AtomicBool>,
    on_event: Option<EventCallback>,
) -> Result<(), RecorderError> {
    // macOS：优先 ScreenCaptureKit 同源画面+系统声；失败再回退 xcap + flexaudio
    #[cfg(target_os = "macos")]
    {
        match capture_loop_sck(
            &monitor,
            fps,
            quality,
            mic_device_id.clone(),
            region,
            ffmpeg_bin,
            output,
            Arc::clone(&stop_flag),
            Arc::clone(&pause_flag),
            Arc::clone(&mic_mute_flag),
            Arc::clone(&sys_mute_flag),
            on_event.clone(),
        ) {
            Ok(()) => return Ok(()),
            Err(e) => {
                eprintln!("[recorder] SCK path failed, fallback to xcap/flexaudio: {e}");
            }
        }
    }

    capture_loop_xcap(
        monitor,
        fps,
        quality,
        mic_device_id,
        system_device_id,
        region,
        ffmpeg_bin,
        output,
        stop_flag,
        pause_flag,
        mic_mute_flag,
        sys_mute_flag,
        on_event,
    )
}

/// macOS ScreenCaptureKit：画面与系统声同一条流；麦仍走 flexaudio
#[cfg(target_os = "macos")]
#[allow(clippy::too_many_arguments)]
fn capture_loop_sck(
    monitor: &xcap::Monitor,
    fps: u32,
    quality: VideoQuality,
    mic_device_id: Option<String>,
    region: Option<RecordRegion>,
    ffmpeg_bin: &str,
    output: &PathBuf,
    stop_flag: Arc<AtomicBool>,
    pause_flag: Arc<AtomicBool>,
    mic_mute_flag: Arc<AtomicBool>,
    sys_mute_flag: Arc<AtomicBool>,
    on_event: Option<EventCallback>,
) -> Result<(), RecorderError> {
    use crate::sck_capture::{SckSession, SckStartOpts};

    let display_id = monitor
        .id()
        .map_err(|e| RecorderError::Capture(e.to_string()))?;
    let video_tmp = sibling_temp(output, "video.tmp.mp4");
    let audio_tmp = sibling_temp(output, "audio.tmp.wav");
    let sys_tmp = sibling_temp(output, "sys.tmp.wav");
    let _ = std::fs::remove_file(&video_tmp);
    let _ = std::fs::remove_file(&audio_tmp);
    let _ = std::fs::remove_file(&sys_tmp);

    // 系统声由 SCK 提供；flexaudio 只采麦
    let mut audio = match AudioSession::start(
        &audio_tmp,
        AudioCaptureOpts {
            enable_mic: true,
            enable_system_audio: false,
            mic_device_id,
            system_device_id: None,
            ffmpeg_bin: ffmpeg_bin.to_string(),
            pause_flag: Arc::clone(&pause_flag),
            mic_mute_flag,
            sys_mute_flag: Arc::clone(&sys_mute_flag),
            // SCK 同源轨自有时间基，不传 CaptureClock，避免改动 mac 同步行为
            capture_clock: None,
        },
    ) {
        Ok(s) => Some(s),
        Err(e) => {
            emit(
                &on_event,
                RecorderEvent::Error {
                    message: format!("mic unavailable, continue: {e}"),
                },
            );
            None
        }
    };

    let sck = SckSession::start(SckStartOpts {
        display_id,
        fps,
        capture_system_audio: true,
        region,
        sys_wav_path: sys_tmp.clone(),
        pause_flag: Arc::clone(&pause_flag),
        sys_mute_flag,
    })?;
    // SCK 音画时间轴起点（用于停录片头裁切；勿用麦会话 started_at）
    let sck_epoch = Instant::now();

    let mut clock = ActiveClock::new();
    let mut last_progress = Instant::now();
    let mut encoder: Option<FfmpegEncoder> = None;
    let mut was_paused = false;
    let mut frames_written: u64 = 0;
    let mut first_video_at: Option<Instant> = None;
    // 最新一帧画面（静止时 SCK 可能长时间无 Complete；按墙钟 CFR 继续写，避免成片短于音频）
    let mut latest: Option<(u32, u32, Vec<u8>)> = None;
    let frame_interval = Duration::from_secs_f64(1.0 / f64::from(fps.max(1)));
    let mut next_frame_at = Instant::now();

    let capture_result = (|| -> Result<(), RecorderError> {
        // 按墙钟把最新画面写到 next_frame_at，静止时段也推进 CFR / progress
        let flush_cfr = |encoder: &mut Option<FfmpegEncoder>,
                         latest: &Option<(u32, u32, Vec<u8>)>,
                         next_frame_at: &mut Instant,
                         frames_written: &mut u64,
                         first_video_at: &mut Option<Instant>|
         -> Result<(), RecorderError> {
            let Some((fw, fh, pixels)) = latest.as_ref() else {
                return Ok(());
            };
            let now = Instant::now();
            // 单次最多补约 1s，避免停录瞬间积压过多
            let max_catchup = fps.max(1) as u32;
            let mut n = 0u32;
            while now >= *next_frame_at && n < max_catchup {
                if encoder.is_none() {
                    *encoder = Some(FfmpegEncoder::start(
                        ffmpeg_bin,
                        &video_tmp,
                        *fw,
                        *fh,
                        fps,
                        quality,
                    )?);
                }
                if let Some(enc) = encoder.as_mut() {
                    enc.write_rgba(*fw, *fh, pixels)?;
                    if first_video_at.is_none() {
                        *first_video_at = Some(Instant::now());
                    }
                    *frames_written += 1;
                }
                *next_frame_at += frame_interval;
                n += 1;
            }
            // 仍严重落后则对齐墙钟，避免死循环；少写的时长由后续正常节奏消化
            if *next_frame_at + frame_interval < now {
                *next_frame_at = now;
            }
            Ok(())
        };

        while !stop_flag.load(Ordering::SeqCst) {
            let paused = pause_flag.load(Ordering::SeqCst);
            if paused {
                if !was_paused {
                    clock.on_pause();
                    was_paused = true;
                }
                while sck.video_rx().try_recv().is_ok() {}
                thread::sleep(Duration::from_millis(20));
                continue;
            }
            if was_paused {
                clock.on_resume();
                next_frame_at = Instant::now();
                was_paused = false;
            }

            match sck.video_rx().recv_timeout(Duration::from_millis(50)) {
                Ok(frame) => {
                    let fw = frame.width & !1;
                    let fh = frame.height & !1;
                    if fw >= 2 && fh >= 2 {
                        // region 已在 SCK sourceRect 裁过；偶发奇数边再裁
                        let pixels = if fw == frame.width && fh == frame.height {
                            frame.rgba
                        } else {
                            let Some((_, _, buf)) = frame_pixels(
                                frame.width,
                                frame.height,
                                &frame.rgba,
                                Some(RecordRegion {
                                    x: 0,
                                    y: 0,
                                    width: fw,
                                    height: fh,
                                }),
                            ) else {
                                flush_cfr(
                                    &mut encoder,
                                    &latest,
                                    &mut next_frame_at,
                                    &mut frames_written,
                                    &mut first_video_at,
                                )?;
                                maybe_progress(&on_event, &clock, &mut last_progress);
                                continue;
                            };
                            buf.into_owned()
                        };
                        latest = Some((fw, fh, pixels));
                    }
                    flush_cfr(
                        &mut encoder,
                        &latest,
                        &mut next_frame_at,
                        &mut frames_written,
                        &mut first_video_at,
                    )?;
                    maybe_progress(&on_event, &clock, &mut last_progress);
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    // 无新脏帧（含仅有背景音乐的静止画面）：继续按 CFR 写当前画面 + 推 progress
                    flush_cfr(
                        &mut encoder,
                        &latest,
                        &mut next_frame_at,
                        &mut frames_written,
                        &mut first_video_at,
                    )?;
                    maybe_progress(&on_event, &clock, &mut last_progress);
                }
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
        let elapsed = clock.active_secs().max(0.001);
        eprintln!(
            "[recorder-sck] video frames={frames_written} active={elapsed:.3}s effective_fps={:.2}",
            frames_written as f64 / elapsed
        );
        Ok(())
    })();

    let video_dur_secs = if frames_written > 0 {
        Some(frames_written as f64 / f64::from(fps.max(1)))
    } else {
        None
    };

    if let Some(enc) = encoder.take() {
        enc.finish()?;
    } else if capture_result.is_ok() {
        let _ = sck.finish();
        let _ = std::fs::remove_file(&audio_tmp);
        return Err(RecorderError::Capture("no frames captured".into()));
    }

    let external_sys = match sck.finish() {
        Ok(p) => p,
        Err(e) => {
            emit(
                &on_event,
                RecorderEvent::Error {
                    message: format!("sck sys finalize: {e}"),
                },
            );
            None
        }
    };

    let audio_path = if let Some(session) = audio.take() {
        match session.finish(video_dur_secs, first_video_at, external_sys, Some(sck_epoch)) {
            Ok(p) => Some(p),
            Err(e) => {
                emit(
                    &on_event,
                    RecorderEvent::Error {
                        message: format!("audio finalize failed: {e}"),
                    },
                );
                None
            }
        }
    } else if let Some(sys) = external_sys {
        match crate::audio::finalize_external_sys_wav(
            ffmpeg_bin,
            &sys,
            &audio_tmp,
            video_dur_secs,
            first_video_at,
            Some(sck_epoch),
        ) {
            Ok(p) => Some(p),
            Err(e) => {
                emit(
                    &on_event,
                    RecorderEvent::Error {
                        message: format!("sys-only finalize failed: {e}"),
                    },
                );
                None
            }
        }
    } else {
        None
    };

    if let Err(e) = capture_result {
        let _ = std::fs::remove_file(&video_tmp);
        let _ = std::fs::remove_file(&audio_tmp);
        return Err(e);
    }

    let has_audio = audio_path
        .as_ref()
        .map(|p| p.exists() && p.metadata().map(|m| m.len() > 64).unwrap_or(false))
        .unwrap_or(false);

    if has_audio {
        if let Some(wav) = &audio_path {
            match mux_video_audio(ffmpeg_bin, &video_tmp, wav, output) {
                Ok(()) => {}
                Err(e) => {
                    emit(
                        &on_event,
                        RecorderEvent::Error {
                            message: format!("mux failed, save video only: {e}"),
                        },
                    );
                    finalize_video_only(&video_tmp, output)?;
                }
            }
        }
    } else {
        finalize_video_only(&video_tmp, output)?;
    }

    if std::env::var_os("RECORDER_KEEP_TEMP").is_none() {
        let _ = std::fs::remove_file(&video_tmp);
        let _ = std::fs::remove_file(&audio_tmp);
        let _ = std::fs::remove_file(&sys_tmp);
    } else {
        eprintln!("[recorder-sck] keep temp video={video_tmp:?} audio={audio_tmp:?}");
    }

    emit(
        &on_event,
        RecorderEvent::Finished {
            output_path: output.to_string_lossy().into_owned(),
        },
    );
    Ok(())
}

/// xcap 画面 + flexaudio 麦/系统声（全平台回退路径）
#[allow(clippy::too_many_arguments)]
fn capture_loop_xcap(
    monitor: xcap::Monitor,
    fps: u32,
    quality: VideoQuality,
    mic_device_id: Option<String>,
    system_device_id: Option<String>,
    region: Option<RecordRegion>,
    ffmpeg_bin: &str,
    output: &PathBuf,
    stop_flag: Arc<AtomicBool>,
    pause_flag: Arc<AtomicBool>,
    mic_mute_flag: Arc<AtomicBool>,
    sys_mute_flag: Arc<AtomicBool>,
    on_event: Option<EventCallback>,
) -> Result<(), RecorderError> {
    let video_tmp = sibling_temp(output, "video.tmp.mp4");
    let audio_tmp = sibling_temp(output, "audio.tmp.wav");
    let _ = std::fs::remove_file(&video_tmp);
    let _ = std::fs::remove_file(&audio_tmp);

    // Windows / xcap 回退：音画共享首帧时钟，写入侧按锚点补欠载
    let capture_clock = CaptureClock::new();

    // 两路都尝试开启，失败不阻断录屏；静音标志支持录制中开关
    let mut audio = match AudioSession::start(
        &audio_tmp,
        AudioCaptureOpts {
            enable_mic: true,
            enable_system_audio: true,
            mic_device_id,
            system_device_id,
            ffmpeg_bin: ffmpeg_bin.to_string(),
            pause_flag: Arc::clone(&pause_flag),
            mic_mute_flag,
            sys_mute_flag,
            capture_clock: Some(Arc::clone(&capture_clock)),
        },
    ) {
        Ok(s) => Some(s),
        Err(e) => {
            emit(
                &on_event,
                RecorderEvent::Error {
                    message: format!("audio unavailable, continue without sound: {e}"),
                },
            );
            None
        }
    };

    let mut clock = ActiveClock::new();
    let mut last_progress = Instant::now();
    let mut encoder: Option<FfmpegEncoder> = None;
    // 上一轮是否处于暂停，用于恢复时重置帧时钟
    let mut was_paused = false;
    // 写出帧数（CFR 时长 = frames / fps），供音频对齐
    let mut frames_written: u64 = 0;
    // 首帧写出时刻：裁掉早于画面的音频片头
    let mut first_video_at: Option<Instant> = None;

    let capture_result = (|| -> Result<(), RecorderError> {
        // 按目标 fps 丢帧：xcap 常 60fps，若原样写入 -r 30 会把视频时间轴拉长，声音相对变尖变快
        let frame_interval = Duration::from_secs_f64(1.0 / f64::from(fps.max(1)));
        let mut next_frame_at = Instant::now();

        if let Ok((video_recorder, rx)) = monitor.video_recorder() {
            if video_recorder.start().is_ok() {
                while !stop_flag.load(Ordering::SeqCst) {
                    let paused = pause_flag.load(Ordering::SeqCst);
                    if paused {
                        if !was_paused {
                            clock.on_pause();
                            was_paused = true;
                        }
                        // 抽干帧队列，避免恢复时积压灌入
                        while rx.try_recv().is_ok() {}
                        thread::sleep(Duration::from_millis(20));
                        continue;
                    }
                    if was_paused {
                        clock.on_resume();
                        next_frame_at = Instant::now();
                        was_paused = false;
                    }

                    match rx.recv_timeout(Duration::from_millis(100)) {
                        Ok(frame) => {
                            let now = Instant::now();
                            if now < next_frame_at {
                                continue;
                            }
                            next_frame_at += frame_interval;
                            // 严重落后时对齐到当前，避免连写追帧再次拉长
                            if next_frame_at + frame_interval < now {
                                next_frame_at = now + frame_interval;
                            }

                            let Some((fw, fh, pixels)) =
                                frame_pixels(frame.width, frame.height, &frame.raw, region)
                            else {
                                continue;
                            };
                            if encoder.is_none() {
                                encoder = Some(FfmpegEncoder::start(
                                    ffmpeg_bin,
                                    &video_tmp,
                                    fw,
                                    fh,
                                    fps,
                                    quality,
                                )?);
                            }
                            if let Some(enc) = encoder.as_mut() {
                                enc.write_rgba(fw, fh, &pixels)?;
                                if first_video_at.is_none() {
                                    first_video_at = Some(Instant::now());
                                    capture_clock.mark_first_video();
                                }
                                frames_written += 1;
                            }
                            maybe_progress(&on_event, &clock, &mut last_progress);
                        }
                        Err(std::sync::mpsc::RecvTimeoutError::Timeout) => continue,
                        Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
                    }
                }
                let _ = video_recorder.stop();
                // 停录后丢弃残留帧，勿一次性灌入（会再次拉长时间轴）
                while rx.try_recv().is_ok() {}
                let elapsed = clock.active_secs().max(0.001);
                eprintln!(
                    "[recorder] video frames={frames_written} active={elapsed:.3}s effective_fps={:.2}",
                    frames_written as f64 / elapsed
                );
                return Ok(());
            }
        }

        let mut next_tick = Instant::now();
        while !stop_flag.load(Ordering::SeqCst) {
            let paused = pause_flag.load(Ordering::SeqCst);
            if paused {
                if !was_paused {
                    clock.on_pause();
                    was_paused = true;
                }
                thread::sleep(Duration::from_millis(20));
                continue;
            }
            if was_paused {
                clock.on_resume();
                next_tick = Instant::now();
                was_paused = false;
            }

            let now = Instant::now();
            if now < next_tick {
                thread::sleep(next_tick.saturating_duration_since(now));
            }
            next_tick = Instant::now() + frame_interval;

            let image = monitor
                .capture_image()
                .map_err(|e| RecorderError::Capture(e.to_string()))?;
            let w = image.width();
            let h = image.height();
            let Some((fw, fh, pixels)) = frame_pixels(w, h, image.as_raw(), region) else {
                continue;
            };
            if encoder.is_none() {
                encoder = Some(FfmpegEncoder::start(
                    ffmpeg_bin,
                    &video_tmp,
                    fw,
                    fh,
                    fps,
                    quality,
                )?);
            }
            if let Some(enc) = encoder.as_mut() {
                enc.write_rgba(fw, fh, &pixels)?;
                if first_video_at.is_none() {
                    first_video_at = Some(Instant::now());
                    capture_clock.mark_first_video();
                }
                frames_written += 1;
            }
            maybe_progress(&on_event, &clock, &mut last_progress);
        }
        let elapsed = clock.active_secs().max(0.001);
        eprintln!(
            "[recorder] video frames={frames_written} active={elapsed:.3}s effective_fps={:.2}",
            frames_written as f64 / elapsed
        );
        Ok(())
    })();

    // 视频 CFR 时长；音频裁片头并按此时长对齐后再 mux（不再依赖 -shortest）
    let video_dur_secs = if frames_written > 0 {
        Some(frames_written as f64 / f64::from(fps.max(1)))
    } else {
        None
    };

    // 先收尾视频编码（定长），再停音频并对齐时长
    if let Some(enc) = encoder.take() {
        enc.finish()?;
    } else if capture_result.is_ok() {
        let _ = std::fs::remove_file(&audio_tmp);
        return Err(RecorderError::Capture("no frames captured".into()));
    }

    let audio_path = if let Some(session) = audio.take() {
        match session.finish(video_dur_secs, first_video_at, None, None) {
            Ok(p) => Some(p),
            Err(e) => {
                emit(
                    &on_event,
                    RecorderEvent::Error {
                        message: format!("audio finalize failed: {e}"),
                    },
                );
                None
            }
        }
    } else {
        None
    };

    if let Err(e) = capture_result {
        let _ = std::fs::remove_file(&video_tmp);
        let _ = std::fs::remove_file(&audio_tmp);
        return Err(e);
    }

    // 混流或仅视频落盘；混流失败则回退无声音频，避免空文件
    let has_audio = audio_path
        .as_ref()
        .map(|p| p.exists() && p.metadata().map(|m| m.len() > 64).unwrap_or(false))
        .unwrap_or(false);

    if has_audio {
        if let Some(wav) = &audio_path {
            match mux_video_audio(ffmpeg_bin, &video_tmp, wav, output) {
                Ok(()) => {}
                Err(e) => {
                    emit(
                        &on_event,
                        RecorderEvent::Error {
                            message: format!("mux failed, save video only: {e}"),
                        },
                    );
                    finalize_video_only(&video_tmp, output)?;
                }
            }
        }
    } else {
        finalize_video_only(&video_tmp, output)?;
    }

    if std::env::var_os("RECORDER_KEEP_TEMP").is_none() {
        let _ = std::fs::remove_file(&video_tmp);
        let _ = std::fs::remove_file(&audio_tmp);
    } else {
        eprintln!("[recorder] keep temp video={video_tmp:?} audio={audio_tmp:?}");
    }

    emit(
        &on_event,
        RecorderEvent::Finished {
            output_path: output.to_string_lossy().into_owned(),
        },
    );
    Ok(())
}

/// 只累计「未暂停」的录制时长，供 progress 上报
struct ActiveClock {
    started: Instant,
    paused_total: Duration,
    pause_at: Option<Instant>,
}

impl ActiveClock {
    fn new() -> Self {
        Self {
            started: Instant::now(),
            paused_total: Duration::ZERO,
            pause_at: None,
        }
    }

    fn on_pause(&mut self) {
        if self.pause_at.is_none() {
            self.pause_at = Some(Instant::now());
        }
    }

    fn on_resume(&mut self) {
        if let Some(at) = self.pause_at.take() {
            self.paused_total += at.elapsed();
        }
    }

    fn active_elapsed(&self) -> Duration {
        let mut paused = self.paused_total;
        if let Some(at) = self.pause_at {
            paused += at.elapsed();
        }
        self.started.elapsed().saturating_sub(paused)
    }

    fn active_secs(&self) -> f64 {
        self.active_elapsed().as_secs_f64()
    }
}

fn maybe_progress(on_event: &Option<EventCallback>, clock: &ActiveClock, last: &mut Instant) {
    if last.elapsed() >= Duration::from_millis(500) {
        *last = Instant::now();
        emit(
            on_event,
            RecorderEvent::Progress {
                elapsed_ms: clock.active_elapsed().as_millis() as u64,
            },
        );
    }
}
