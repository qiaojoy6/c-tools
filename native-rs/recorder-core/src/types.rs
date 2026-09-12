use serde::{Deserialize, Serialize};

/// 采集设备类型
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DeviceType {
    Screen,
    Mic,
    SystemAudio,
}

/// 设备信息（屏幕 / 麦克风）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub id: String,
    pub name: String,
    pub device_type: DeviceType,
    pub width: u32,
    pub height: u32,
    pub is_primary: bool,
}

/// 视频清晰度档位（只影响画面；音频编码不变）
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum VideoQuality {
    /// 原画：捕获分辨率，CRF 18
    #[default]
    Original,
    /// 超清：约 75% 分辨率，CRF 22
    Ultra,
    /// 流畅：约 50% 分辨率，CRF 28
    Smooth,
}

impl VideoQuality {
    /// 输出缩放比例与 x264 CRF（数值越大压缩越狠、体积越小）
    pub fn encode_params(self) -> (f32, u8) {
        match self {
            Self::Original => (1.0, 18),
            Self::Ultra => (0.75, 22),
            Self::Smooth => (0.5, 28),
        }
    }
}

/// 录制配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordConfig {
    /// 目标显示器 id；空则用主屏
    pub screen_id: Option<String>,
    /// 是否录制麦克风（默认 true）
    pub enable_mic: bool,
    /// 是否录制系统声音（默认 true）
    pub enable_system_audio: bool,
    /// 麦克风设备 id；空则系统默认
    pub mic_device_id: Option<String>,
    /// 系统输出环回设备 id；空则默认输出
    pub system_device_id: Option<String>,
    /// 帧率（默认 30）
    pub fps: u32,
    /// 视频清晰度（默认原画）；不影响音质
    pub quality: VideoQuality,
    /// 输出 MP4 绝对路径
    pub output_path: String,
    /// ffmpeg 可执行路径；空则从 PATH 查找
    pub ffmpeg_path: Option<String>,
    /// 相对目标显示器左上角的裁剪区域（与捕获帧同一像素坐标，通常为物理像素）；空则整屏
    pub region: Option<RecordRegion>,
}

/// 区域录屏矩形（相对所选显示器）
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordRegion {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

impl Default for RecordConfig {
    fn default() -> Self {
        Self {
            screen_id: None,
            enable_mic: true,
            enable_system_audio: true,
            mic_device_id: None,
            system_device_id: None,
            fps: 30,
            quality: VideoQuality::Original,
            output_path: String::new(),
            ffmpeg_path: None,
            region: None,
        }
    }
}

/// 录制状态
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RecorderState {
    Idle,
    Recording,
    /// 软暂停：音画都不写入，时间轴不推进
    Paused,
    Stopping,
}

/// 向上层上报的事件
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum RecorderEvent {
    #[serde(rename = "stateChanged")]
    StateChanged { state: RecorderState },
    #[serde(rename = "progress")]
    Progress {
        #[serde(rename = "elapsedMs")]
        elapsed_ms: u64,
    },
    #[serde(rename = "error")]
    Error { message: String },
    #[serde(rename = "finished")]
    Finished {
        #[serde(rename = "outputPath")]
        output_path: String,
    },
}
