//! 焦点交接 + 模拟粘贴：纯 Rust 内核（无 UI / 无 napi）
//!
//! 按平台分模块：`win`（user32）/ `mac`（osascript 等价能力）

#![deny(clippy::all)]

mod error;

#[cfg(windows)]
pub mod win;

#[cfg(target_os = "macos")]
pub mod mac;

pub use error::FocusPasteError;
