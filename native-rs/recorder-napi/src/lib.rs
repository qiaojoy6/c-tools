//! Electron 用 napi 胶水：枚举屏幕/麦克风/系统声、启停录制、TSFN 事件回调

#![deny(clippy::all)]

use napi::bindgen_prelude::*;
use napi::threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi_derive::napi;
use recorder_core::{
    list_mics, list_screens, list_system_outputs, DeviceInfo, DeviceType, RecordConfig, RecordRegion,
    Recorder, RecorderEvent, RecorderState, VideoQuality,
};
use serde::Serialize;
use std::sync::{Arc, Mutex, OnceLock};

static RECORDER: OnceLock<Recorder> = OnceLock::new();
static EVENT_TSFN: OnceLock<Mutex<Option<ThreadsafeFunction<EventPayload, ErrorStrategy::Fatal>>>> =
    OnceLock::new();

fn recorder() -> &'static Recorder {
    RECORDER.get_or_init(Recorder::new)
}

fn event_slot() -> &'static Mutex<Option<ThreadsafeFunction<EventPayload, ErrorStrategy::Fatal>>> {
    EVENT_TSFN.get_or_init(|| Mutex::new(None))
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EventPayload {
    #[serde(flatten)]
    event: RecorderEvent,
}

fn emit_to_js(event: RecorderEvent) {
    let Ok(guard) = event_slot().lock() else {
        return;
    };
    if let Some(tsfn) = guard.as_ref() {
        let payload = EventPayload { event };
        let _ = tsfn.call(payload, ThreadsafeFunctionCallMode::NonBlocking);
    }
}

#[napi(object)]
pub struct DeviceInfoJs {
    pub id: String,
    pub name: String,
    #[napi(js_name = "deviceType")]
    pub device_type: String,
    pub width: u32,
    pub height: u32,
    #[napi(js_name = "isPrimary")]
    pub is_primary: bool,
}

impl From<DeviceInfo> for DeviceInfoJs {
    fn from(d: DeviceInfo) -> Self {
        let device_type = match d.device_type {
            DeviceType::Screen => "screen",
            DeviceType::Mic => "mic",
            DeviceType::SystemAudio => "systemAudio",
        };
        Self {
            id: d.id,
            name: d.name,
            device_type: device_type.into(),
            width: d.width,
            height: d.height,
            is_primary: d.is_primary,
        }
    }
}

#[napi(object)]
pub struct RecordRegionJs {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[napi(object)]
pub struct RecordConfigJs {
    #[napi(js_name = "screenId")]
    pub screen_id: Option<String>,
    #[napi(js_name = "enableMic")]
    pub enable_mic: Option<bool>,
    #[napi(js_name = "enableSystemAudio")]
    pub enable_system_audio: Option<bool>,
    #[napi(js_name = "micDeviceId")]
    pub mic_device_id: Option<String>,
    #[napi(js_name = "systemDeviceId")]
    pub system_device_id: Option<String>,
    pub fps: Option<u32>,
    /// 视频清晰度：original | ultra | smooth；省略则原画
    pub quality: Option<String>,
    #[napi(js_name = "outputPath")]
    pub output_path: String,
    #[napi(js_name = "ffmpegPath")]
    pub ffmpeg_path: Option<String>,
    /// 相对目标显示器的裁剪区域（物理像素）；省略则整屏
    pub region: Option<RecordRegionJs>,
}

/// 枚举显示器
#[napi(js_name = "listScreens")]
pub fn list_screens_js() -> Result<Vec<DeviceInfoJs>> {
    list_screens()
        .map(|list| list.into_iter().map(DeviceInfoJs::from).collect())
        .map_err(|e| Error::from_reason(e.to_string()))
}

/// 枚举麦克风
#[napi(js_name = "listMics")]
pub fn list_mics_js() -> Result<Vec<DeviceInfoJs>> {
    list_mics()
        .map(|list| list.into_iter().map(DeviceInfoJs::from).collect())
        .map_err(|e| Error::from_reason(e.to_string()))
}

/// 枚举系统声输出（环回）
#[napi(js_name = "listSystemOutputs")]
pub fn list_system_outputs_js() -> Result<Vec<DeviceInfoJs>> {
    list_system_outputs()
        .map(|list| list.into_iter().map(DeviceInfoJs::from).collect())
        .map_err(|e| Error::from_reason(e.to_string()))
}

/// 注册事件回调
#[napi(js_name = "onEvent")]
pub fn on_event(callback: JsFunction) -> Result<()> {
    let tsfn: ThreadsafeFunction<EventPayload, ErrorStrategy::Fatal> = callback
        .create_threadsafe_function(0, |ctx| {
            let value = ctx.env.to_js_value(&ctx.value)?;
            Ok(vec![value])
        })?;

    {
        let mut slot = event_slot()
            .lock()
            .map_err(|_| Error::from_reason("event lock poisoned"))?;
        *slot = Some(tsfn);
    }

    recorder().set_event_callback(Arc::new(|ev| emit_to_js(ev)));
    Ok(())
}

/// 开始录制
#[napi(js_name = "startRecord")]
pub fn start_record(config: RecordConfigJs) -> Result<()> {
    let region = config.region.and_then(|r| {
        if r.width < 2 || r.height < 2 {
            None
        } else {
            Some(RecordRegion {
                x: r.x,
                y: r.y,
                width: r.width,
                height: r.height,
            })
        }
    });
    let cfg = RecordConfig {
        screen_id: config.screen_id,
        enable_mic: config.enable_mic.unwrap_or(true),
        enable_system_audio: config.enable_system_audio.unwrap_or(true),
        mic_device_id: config.mic_device_id,
        system_device_id: config.system_device_id,
        fps: config.fps.unwrap_or(30),
        quality: parse_quality(config.quality.as_deref()),
        output_path: config.output_path,
        ffmpeg_path: config.ffmpeg_path,
        region,
    };
    recorder()
        .start(cfg)
        .map_err(|e| Error::from_reason(e.to_string()))
}

/// original / ultra / smooth；非法或空则原画
fn parse_quality(raw: Option<&str>) -> VideoQuality {
    match raw.map(|s| s.trim().to_ascii_lowercase()).as_deref() {
        Some("ultra") => VideoQuality::Ultra,
        Some("smooth") => VideoQuality::Smooth,
        Some("original") | None | Some("") => VideoQuality::Original,
        _ => VideoQuality::Original,
    }
}

/// 停止录制
#[napi(js_name = "stopRecord")]
pub fn stop_record() -> Result<()> {
    recorder()
        .stop()
        .map_err(|e| Error::from_reason(e.to_string()))
}

/// 软暂停
#[napi(js_name = "pauseRecord")]
pub fn pause_record() -> Result<()> {
    recorder()
        .pause()
        .map_err(|e| Error::from_reason(e.to_string()))
}

/// 继续录制
#[napi(js_name = "resumeRecord")]
pub fn resume_record() -> Result<()> {
    recorder()
        .resume()
        .map_err(|e| Error::from_reason(e.to_string()))
}

/// 录制中实时开关麦克风
#[napi(js_name = "setMicEnabled")]
pub fn set_mic_enabled(enabled: bool) -> Result<()> {
    recorder()
        .set_mic_enabled(enabled)
        .map_err(|e| Error::from_reason(e.to_string()))
}

/// 录制中实时开关系统声
#[napi(js_name = "setSystemAudioEnabled")]
pub fn set_system_audio_enabled(enabled: bool) -> Result<()> {
    recorder()
        .set_system_audio_enabled(enabled)
        .map_err(|e| Error::from_reason(e.to_string()))
}

/// 当前状态
#[napi(js_name = "getState")]
pub fn get_state() -> String {
    match recorder().state() {
        RecorderState::Idle => "idle".into(),
        RecorderState::Recording => "recording".into(),
        RecorderState::Paused => "paused".into(),
        RecorderState::Stopping => "stopping".into(),
    }
}
