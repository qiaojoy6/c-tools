//! 录制生命周期：启停、软暂停/继续、采集线程、事件回调

use crate::audio::{AudioCaptureOpts, AudioSession};
use crate::encoder::{
    finalize_video_only, mux_video_audio, resolve_ffmpeg, sibling_temp, FfmpegEncoder,
};
use crate::screen::resolve_monitor;
use crate::types::{RecordConfig, RecorderEvent, RecorderState};
use crate::RecorderError;
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
        let enable_mic = config.enable_mic;
        let enable_system_audio = config.enable_system_audio;
        let mic_device_id = config.mic_device_id.clone();
        let system_device_id = config.system_device_id.clone();

        let stop_flag = Arc::new(AtomicBool::new(false));
        let pause_flag = Arc::new(AtomicBool::new(false));
        let stop_flag_t = Arc::clone(&stop_flag);
        let pause_flag_t = Arc::clone(&pause_flag);
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
                    enable_mic,
                    enable_system_audio,
                    mic_device_id,
                    system_device_id,
                    &ffmpeg_bin,
                    &output,
                    stop_flag_t,
                    pause_flag_t,
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

/// 画面 + 可选麦克风/系统声；先写临时视频/音频，停录后再混流
#[allow(clippy::too_many_arguments)]
fn capture_loop(
    monitor: xcap::Monitor,
    fps: u32,
    enable_mic: bool,
    enable_system_audio: bool,
    mic_device_id: Option<String>,
    system_device_id: Option<String>,
    ffmpeg_bin: &str,
    output: &PathBuf,
    stop_flag: Arc<AtomicBool>,
    pause_flag: Arc<AtomicBool>,
    on_event: Option<EventCallback>,
) -> Result<(), RecorderError> {
    let video_tmp = sibling_temp(output, "video.tmp.mp4");
    let audio_tmp = sibling_temp(output, "audio.tmp.wav");
    let _ = std::fs::remove_file(&video_tmp);
    let _ = std::fs::remove_file(&audio_tmp);

    // 音频失败不阻断录屏，仅无声
    let mut audio = if enable_mic || enable_system_audio {
        match AudioSession::start(
            &audio_tmp,
            AudioCaptureOpts {
                enable_mic,
                enable_system_audio,
                mic_device_id,
                system_device_id,
                ffmpeg_bin: ffmpeg_bin.to_string(),
                pause_flag: Arc::clone(&pause_flag),
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
        }
    } else {
        None
    };

    let mut clock = ActiveClock::new();
    let mut last_progress = Instant::now();
    let mut encoder: Option<FfmpegEncoder> = None;
    // 上一轮是否处于暂停，用于恢复时重置帧时钟
    let mut was_paused = false;

    let capture_result = (|| -> Result<(), RecorderError> {
        // 按目标 fps 丢帧：xcap 常 60fps，若原样写入 -r 30 会把视频时间轴拉长，声音相对变尖变快
        let frame_interval = Duration::from_secs_f64(1.0 / f64::from(fps.max(1)));
        let mut next_frame_at = Instant::now();
        let mut frames_written: u64 = 0;

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

                            if encoder.is_none() {
                                encoder = Some(FfmpegEncoder::start(
                                    ffmpeg_bin,
                                    &video_tmp,
                                    frame.width,
                                    frame.height,
                                    fps,
                                )?);
                            }
                            if let Some(enc) = encoder.as_mut() {
                                enc.write_rgba(frame.width, frame.height, &frame.raw)?;
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
            if encoder.is_none() {
                encoder = Some(FfmpegEncoder::start(ffmpeg_bin, &video_tmp, w, h, fps)?);
            }
            if let Some(enc) = encoder.as_mut() {
                enc.write_rgba(w, h, image.as_raw())?;
            }
            maybe_progress(&on_event, &clock, &mut last_progress);
        }
        Ok(())
    })();

    // 先停音频再收尾视频，保证音画时长接近
    let audio_path = if let Some(session) = audio.take() {
        match session.finish() {
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

    if let Some(enc) = encoder.take() {
        enc.finish()?;
    } else if capture_result.is_ok() {
        let _ = std::fs::remove_file(&audio_tmp);
        return Err(RecorderError::Capture("no frames captured".into()));
    }

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
