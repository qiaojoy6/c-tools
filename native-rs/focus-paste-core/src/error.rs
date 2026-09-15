//! 错误类型

use thiserror::Error;

#[derive(Debug, Error)]
pub enum FocusPasteError {
    #[error("unsupported platform")]
    UnsupportedPlatform,
    #[error("invalid hwnd token: {0}")]
    InvalidToken(String),
    #[error("window api failed: {0}")]
    WinApi(String),
    #[error("mac focus/paste failed: {0}")]
    Mac(String),
}
