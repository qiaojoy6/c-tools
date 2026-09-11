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
    /// 输出 MP4 绝对路径
    pub output_path: String,
    /// ffmpeg 可执行路径；空则从 PATH 查找
    pub ffmpeg_path: Option<String>,
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
            output_path: String::new(),
            ffmpeg_path: None,
        }
    }
}

/// 录制状态
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RecorderState {
    Idle,
    Recording,
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
