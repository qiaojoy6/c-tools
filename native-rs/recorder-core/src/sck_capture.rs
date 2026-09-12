//! macOS ScreenCaptureKit：同一条 SCStream 产出画面 + 系统声（同源时钟）
//!
//! 非 macOS 为空实现，pipeline 走 xcap + flexaudio 回退。

#![cfg(target_os = "macos")]

use crate::types::RecordRegion;
use crate::RecorderError;
use core_foundation::base::TCFType;
use core_graphics::geometry::{CGPoint, CGRect, CGSize};
use core_media_rs::cm_sample_buffer::{CMSampleBuffer, CMSampleBufferRef};
use core_media_rs::cm_time::CMTime;
use core_video_rs::cv_pixel_buffer::lock::LockTrait;
use hound::{SampleFormat as WavSampleFormat, WavSpec, WavWriter};
use screencapturekit::{
    output::sc_stream_frame_info::{SCFrameStatus, SCStreamFrameInfo},
    shareable_content::SCShareableContent,
    stream::{
        configuration::{
            colors::kCGColorSpaceSRGB, pixel_format::PixelFormat, SCStreamConfiguration,
        },
        content_filter::SCContentFilter,
        output_trait::SCStreamOutputTrait,
        output_type::SCStreamOutputType,
        SCStream,
    },
};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, SyncSender};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::Duration;

const TARGET_RATE: u32 = 48_000;
const TARGET_CH: u16 = 2;

/// 一帧 BGRA→RGBA 画面（已按 region 裁剪）
pub struct SckVideoFrame {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

/// ScreenCaptureKit 会话：画面经 channel，系统声写到 WAV
pub struct SckSession {
    stream: SCStream,
    video_rx: Receiver<SckVideoFrame>,
    sys_path: PathBuf,
    sys_writer: Option<JoinHandle<Result<(), RecorderError>>>,
    sys_stop: Arc<AtomicBool>,
    sys_samples: Arc<AtomicU64>,
}

pub struct SckStartOpts {
    pub display_id: u32,
    pub fps: u32,
    pub capture_system_audio: bool,
    pub region: Option<RecordRegion>,
    pub sys_wav_path: PathBuf,
    pub pause_flag: Arc<AtomicBool>,
    pub sys_mute_flag: Arc<AtomicBool>,
}

impl SckSession {
    /// 打开 SCK；失败时由调用方回退 xcap + flexaudio
    pub fn start(opts: SckStartOpts) -> Result<Self, RecorderError> {
        let content = SCShareableContent::get()
            .map_err(|e| RecorderError::Capture(format!("SCShareableContent: {e:?}")))?;
        let display = content
            .displays()
            .into_iter()
            .find(|d| d.display_id() == opts.display_id)
            .ok_or_else(|| {
                RecorderError::Capture(format!("SCK display {} not found", opts.display_id))
            })?;

        // SCDisplay.width/height = 逻辑点；配置缓冲要用 CGDisplayMode 的 pixelWidth/Height。
        // 注意：CGDisplayPixelsWide 在部分 Retina 缩放下仍返回「看起来像」的点数（本机 1800），
        // 不能当物理像素用，否则画面挤在左上角留黑边。
        let point_w = display.width().max(2);
        let point_h = display.height().max(2);
        let (pixel_w, pixel_h) = display_mode_pixel_size(opts.display_id)
            .unwrap_or((point_w.saturating_mul(2), point_h.saturating_mul(2)));
        let pixel_w = pixel_w.max(2);
        let pixel_h = pixel_h.max(2);
        let scale_x = pixel_w as f64 / point_w as f64;
        let scale_y = pixel_h as f64 / point_h as f64;

        let fps = opts.fps.max(1) as f64;
        let interval = CMTime {
            value: (1_000.0 / fps).round() as i64,
            timescale: 1_000,
            flags: 1,
            epoch: 0,
        };

        let (out_w, out_h, source_rect) = if let Some(r) = opts.region {
            // 上层 region = 物理像素；sourceRect 用逻辑点；输出缓冲 = 物理像素（2x）
            let sx = (r.x as f64 / scale_x).max(0.0);
            let sy = (r.y as f64 / scale_y).max(0.0);
            let sw = (r.width.max(2) as f64 / scale_x).max(1.0);
            let sh = (r.height.max(2) as f64 / scale_y).max(1.0);
            (
                r.width.max(2) & !1,
                r.height.max(2) & !1,
                Some(CGRect::new(&CGPoint::new(sx, sy), &CGSize::new(sw, sh))),
            )
        } else {
            (pixel_w & !1, pixel_h & !1, None)
        };

        let mut config = SCStreamConfiguration::new()
            .set_width(out_w)
            .map_err(cf_err)?
            .set_height(out_h)
            .map_err(cf_err)?
            .set_pixel_format(PixelFormat::BGRA)
            .map_err(cf_err)?
            // 默认跟显示器（多为 Display P3）；强制 sRGB 再编码 bt709，避免轻微饱和度偏差
            .set_color_space_name(unsafe { kCGColorSpaceSRGB })
            .map_err(cf_err)?
            .set_shows_cursor(true)
            .map_err(cf_err)?
            // 缓冲已按物理像素对齐，勿再 scalesToFit（会二次缩放、发糊/偏色）
            .set_scales_to_fit(false)
            .map_err(cf_err)?
            .set_minimum_frame_interval(&interval)
            .map_err(cf_err)?
            .set_queue_depth(6)
            .map_err(cf_err)?;

        if let Some(rect) = source_rect {
            config = config.set_source_rect(rect).map_err(cf_err)?;
        }

        if opts.capture_system_audio {
            config = config
                .set_captures_audio(true)
                .map_err(cf_err)?
                .set_excludes_current_process_audio(true)
                .map_err(cf_err)?
                .set_sample_rate(TARGET_RATE)
                .map_err(cf_err)?
                .set_channel_count(TARGET_CH as u8)
                .map_err(cf_err)?;
        }

        let filter = SCContentFilter::new().with_display_excluding_windows(&display, &[]);
        let mut stream = SCStream::new(&filter, &config);

        let (video_tx, video_rx) = mpsc::sync_channel::<SckVideoFrame>(8);
        let (audio_tx, audio_rx) = mpsc::sync_channel::<AudioChunk>(32);
        let audio_tx = if opts.capture_system_audio {
            Some(audio_tx)
        } else {
            drop(audio_tx);
            None
        };

        stream.add_output_handler(
            OutputHandler {
                video_tx: video_tx.clone(),
                audio_tx: audio_tx.clone(),
            },
            SCStreamOutputType::Screen,
        );
        if audio_tx.is_some() {
            stream.add_output_handler(
                OutputHandler {
                    video_tx,
                    audio_tx: audio_tx.clone(),
                },
                SCStreamOutputType::Audio,
            );
        } else {
            drop(video_tx);
        }

        stream
            .start_capture()
            .map_err(|e| RecorderError::Capture(format!("SCK start: {e:?}")))?;

        let sys_stop = Arc::new(AtomicBool::new(false));
        let sys_samples = Arc::new(AtomicU64::new(0));
        let sys_writer = if opts.capture_system_audio {
            Some(spawn_sys_writer(
                opts.sys_wav_path.clone(),
                audio_rx,
                Arc::clone(&sys_stop),
                Arc::clone(&opts.pause_flag),
                Arc::clone(&opts.sys_mute_flag),
                Arc::clone(&sys_samples),
            )?)
        } else {
            // 丢掉未使用的 receiver
            drop(audio_rx);
            let _ = std::fs::remove_file(&opts.sys_wav_path);
            None
        };

        eprintln!(
            "[recorder-sck] started display={} points={point_w}x{point_h} pixels={pixel_w}x{pixel_h} out={out_w}x{out_h} scale={scale_x:.2}x{scale_y:.2} fps={} sys_audio={}",
            opts.display_id, opts.fps, opts.capture_system_audio
        );

        Ok(Self {
            stream,
            video_rx,
            sys_path: opts.sys_wav_path,
            sys_writer,
            sys_stop,
            sys_samples,
        })
    }

    pub fn video_rx(&self) -> &Receiver<SckVideoFrame> {
        &self.video_rx
    }

    /// 停流并收尾系统声 WAV
    pub fn finish(mut self) -> Result<Option<PathBuf>, RecorderError> {
        let _ = self.stream.stop_capture();
        // 抽干残留视频，避免阻塞回调
        while self.video_rx.try_recv().is_ok() {}

        self.sys_stop.store(true, Ordering::SeqCst);
        let sys = if let Some(join) = self.sys_writer.take() {
            match join.join() {
                Ok(Ok(())) => {
                    let n = self.sys_samples.load(Ordering::Relaxed);
                    if n > 0 && self.sys_path.is_file() {
                        Some(self.sys_path)
                    } else {
                        let _ = std::fs::remove_file(&self.sys_path);
                        None
                    }
                }
                Ok(Err(e)) => return Err(e),
                Err(_) => {
                    return Err(RecorderError::Audio("sck sys writer panicked".into()));
                }
            }
        } else {
            None
        };
        Ok(sys)
    }
}

struct AudioChunk {
    /// interleaved f32 stereo @ 48k
    samples: Vec<f32>,
    pts_ns: i64,
}

struct OutputHandler {
    video_tx: SyncSender<SckVideoFrame>,
    audio_tx: Option<SyncSender<AudioChunk>>,
}

impl SCStreamOutputTrait for OutputHandler {
    fn did_output_sample_buffer(
        &self,
        sample_buffer: CMSampleBuffer,
        of_type: SCStreamOutputType,
    ) {
        match of_type {
            SCStreamOutputType::Screen => {
                if let Ok(info) = SCStreamFrameInfo::from_sample_buffer(&sample_buffer) {
                    match info.status() {
                        SCFrameStatus::Complete | SCFrameStatus::Started => {}
                        _ => return,
                    }
                }
                if let Some(frame) = convert_video(&sample_buffer) {
                    let _ = self.video_tx.try_send(frame);
                }
            }
            SCStreamOutputType::Audio => {
                let Some(tx) = &self.audio_tx else {
                    return;
                };
                if let Some(chunk) = convert_audio(&sample_buffer) {
                    let _ = tx.try_send(chunk);
                }
            }
        }
    }
}

fn convert_video(sample: &CMSampleBuffer) -> Option<SckVideoFrame> {
    let pixel = sample.get_pixel_buffer().ok()?;
    let w = pixel.get_width() as usize;
    let h = pixel.get_height() as usize;
    if w < 2 || h < 2 {
        return None;
    }
    let guard = pixel.lock().ok()?;
    let src = guard.as_slice();
    let stride = pixel.get_bytes_per_row() as usize;
    let row_len = w * 4;
    let mut rgba = vec![0u8; row_len * h];
    for y in 0..h {
        let src_row = y * stride;
        let dst_row = y * row_len;
        if src_row + row_len > src.len() || dst_row + row_len > rgba.len() {
            break;
        }
        // BGRA → RGBA（按行转换，与 xcap 一致）
        let s = &src[src_row..src_row + row_len];
        let d = &mut rgba[dst_row..dst_row + row_len];
        for (src_px, dst_px) in s.chunks_exact(4).zip(d.chunks_exact_mut(4)) {
            dst_px[0] = src_px[2];
            dst_px[1] = src_px[1];
            dst_px[2] = src_px[0];
            dst_px[3] = src_px[3];
        }
    }
    Some(SckVideoFrame {
        width: w as u32,
        height: h as u32,
        rgba,
    })
}

fn convert_audio(sample: &CMSampleBuffer) -> Option<AudioChunk> {
    let pts_ns = sample_pts_ns(sample).unwrap_or(0);
    let list = sample.get_audio_buffer_list().ok()?;
    let n = list.num_buffers();
    if n == 0 {
        return None;
    }

    // 常见：双平面 float32（L/R），或单缓冲 interleaved
    let samples = if n >= 2 {
        let left = f32_slice(list.get(0)?.data());
        let right = f32_slice(list.get(1)?.data());
        let frames = left.len().min(right.len());
        let mut out = Vec::with_capacity(frames * 2);
        for i in 0..frames {
            out.push(left[i]);
            out.push(right[i]);
        }
        out
    } else {
        let buf = list.get(0)?;
        let ch = buf.number_channels.max(1) as usize;
        let data = f32_slice(buf.data());
        if ch == 1 {
            let mut out = Vec::with_capacity(data.len() * 2);
            for &s in &data {
                out.push(s);
                out.push(s);
            }
            out
        } else {
            // 已 interleaved，截到立体声
            data.chunks(ch)
                .flat_map(|frame| {
                    let l = frame.first().copied().unwrap_or(0.0);
                    let r = frame.get(1).copied().unwrap_or(l);
                    [l, r]
                })
                .collect()
        }
    };

    if samples.is_empty() {
        return None;
    }
    Some(AudioChunk { samples, pts_ns })
}

fn f32_slice(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect()
}

fn sample_pts_ns(sample: &CMSampleBuffer) -> Option<i64> {
    unsafe {
        let t = CMSampleBufferGetPresentationTimeStamp(sample.as_concrete_TypeRef());
        if t.timescale == 0 {
            return None;
        }
        let secs = t.value as f64 / f64::from(t.timescale);
        Some((secs * 1_000_000_000.0).round() as i64)
    }
}

#[link(name = "CoreMedia", kind = "framework")]
unsafe extern "C" {
    fn CMSampleBufferGetPresentationTimeStamp(s: CMSampleBufferRef) -> CMTime;
}

fn spawn_sys_writer(
    path: PathBuf,
    rx: Receiver<AudioChunk>,
    stop: Arc<AtomicBool>,
    pause: Arc<AtomicBool>,
    mute: Arc<AtomicBool>,
    samples_written: Arc<AtomicU64>,
) -> Result<JoinHandle<Result<(), RecorderError>>, RecorderError> {
    let _ = std::fs::remove_file(&path);
    thread::Builder::new()
        .name("recorder-sck-sys".into())
        .spawn(move || {
            let spec = WavSpec {
                channels: TARGET_CH,
                sample_rate: TARGET_RATE,
                bits_per_sample: 16,
                sample_format: WavSampleFormat::Int,
            };
            let mut writer = WavWriter::create(&path, spec)
                .map_err(|e| RecorderError::Audio(format!("sck sys wav: {e}")))?;
            let mut last_pts: Option<i64> = None;
            let mut last_frames: u64 = 0;
            let mut gap_frames: u64 = 0;

            let write_silence = |writer: &mut WavWriter<std::io::BufWriter<std::fs::File>>,
                                 frames: u64,
                                 samples_written: &AtomicU64|
             -> Result<(), RecorderError> {
                let n = frames.saturating_mul(TARGET_CH as u64);
                for _ in 0..n {
                    writer
                        .write_sample(0i16)
                        .map_err(|e| RecorderError::Audio(format!("sck silence: {e}")))?;
                }
                samples_written.fetch_add(n, Ordering::Relaxed);
                Ok(())
            };

            while !stop.load(Ordering::SeqCst) {
                match rx.recv_timeout(Duration::from_millis(50)) {
                    Ok(chunk) => {
                        let frames = (chunk.samples.len() / TARGET_CH as usize) as u64;
                        if pause.load(Ordering::SeqCst) {
                            last_pts = Some(chunk.pts_ns);
                            last_frames = frames;
                            continue;
                        }
                        // PTS 空洞补静音（与画面同源时间基）
                        if let Some(prev) = last_pts {
                            let ns_per = 1_000_000_000i64 / i64::from(TARGET_RATE);
                            // 用上一包时长估算期望 PTS（勿用当前包 frames，否则空洞算错）
                            let expected = prev + last_frames as i64 * ns_per;
                            let gap = chunk.pts_ns - expected;
                            if gap > ns_per * 2 {
                                let pad = ((gap as f64) * f64::from(TARGET_RATE) / 1e9).round()
                                    as u64;
                                if pad > 0 {
                                    write_silence(&mut writer, pad, &samples_written)?;
                                    gap_frames += pad;
                                }
                            }
                        }
                        last_pts = Some(chunk.pts_ns);
                        last_frames = frames;

                        if mute.load(Ordering::SeqCst) {
                            write_silence(&mut writer, frames, &samples_written)?;
                        } else {
                            for &s in &chunk.samples {
                                let v = (s.clamp(-1.0, 1.0) * f32::from(i16::MAX)) as i16;
                                writer
                                    .write_sample(v)
                                    .map_err(|e| RecorderError::Audio(format!("sck write: {e}")))?;
                            }
                            samples_written
                                .fetch_add(chunk.samples.len() as u64, Ordering::Relaxed);
                        }
                    }
                    Err(mpsc::RecvTimeoutError::Timeout) => continue,
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                }
            }
            // 抽干
            while let Ok(chunk) = rx.try_recv() {
                if pause.load(Ordering::SeqCst) {
                    continue;
                }
                let frames = (chunk.samples.len() / TARGET_CH as usize) as u64;
                if mute.load(Ordering::SeqCst) {
                    write_silence(&mut writer, frames, &samples_written)?;
                } else {
                    for &s in &chunk.samples {
                        let v = (s.clamp(-1.0, 1.0) * f32::from(i16::MAX)) as i16;
                        writer
                            .write_sample(v)
                            .map_err(|e| RecorderError::Audio(format!("sck write: {e}")))?;
                    }
                    samples_written.fetch_add(chunk.samples.len() as u64, Ordering::Relaxed);
                }
            }

            if gap_frames > 0 {
                eprintln!(
                    "[recorder-sck] sys gap silence={gap_frames} frames ({:.0}ms)",
                    gap_frames as f64 * 1000.0 / f64::from(TARGET_RATE)
                );
            }
            writer
                .finalize()
                .map_err(|e| RecorderError::Audio(format!("sck finalize: {e}")))?;
            Ok(())
        })
        .map_err(|e| RecorderError::Internal(format!("spawn sck sys: {e}")))
}

fn cf_err(e: core_foundation::error::CFError) -> RecorderError {
    RecorderError::Capture(format!("SCK config: {e:?}"))
}

/// 当前显示模式的物理像素尺寸（Retina 缩放下远大于 SCDisplay.width）
fn display_mode_pixel_size(display_id: u32) -> Option<(u32, u32)> {
    unsafe {
        let mode = CGDisplayCopyDisplayMode(display_id);
        if mode.is_null() {
            return None;
        }
        let w = CGDisplayModeGetPixelWidth(mode) as u32;
        let h = CGDisplayModeGetPixelHeight(mode) as u32;
        CGDisplayModeRelease(mode);
        if w < 2 || h < 2 {
            None
        } else {
            Some((w, h))
        }
    }
}

#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGDisplayCopyDisplayMode(display: u32) -> *mut std::ffi::c_void;
    fn CGDisplayModeGetPixelWidth(mode: *mut std::ffi::c_void) -> usize;
    fn CGDisplayModeGetPixelHeight(mode: *mut std::ffi::c_void) -> usize;
    fn CGDisplayModeRelease(mode: *mut std::ffi::c_void);
}
