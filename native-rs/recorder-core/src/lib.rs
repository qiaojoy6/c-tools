//! recorder-core：纯 Rust 录屏内核（无 UI / 无 napi）

mod audio;
mod encoder;
mod pipeline;
mod screen;
mod types;

pub use audio::{list_mics, list_system_outputs};
pub use pipeline::{EventCallback, Recorder};
pub use screen::list_screens;
pub use types::{DeviceInfo, DeviceType, RecordConfig, RecorderEvent, RecorderState};

use thiserror::Error;

#[derive(Debug, Error)]
pub enum RecorderError {
    #[error("invalid config: {0}")]
    InvalidConfig(String),
    #[error("no screen available")]
    NoScreen,
    #[error("screen not found: {0}")]
    ScreenNotFound(String),
    #[error("already recording")]
    AlreadyRecording,
    #[error("not recording")]
    NotRecording,
    #[error("not paused")]
    NotPaused,
    #[error("capture error: {0}")]
    Capture(String),
    #[error("audio error: {0}")]
    Audio(String),
    #[error("encoder error: {0}")]
    Encoder(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("internal: {0}")]
    Internal(String),
}
