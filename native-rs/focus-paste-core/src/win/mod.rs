//! Windows：前台 hwnd 采集 / 激活 / 模拟 Ctrl+V

mod activate;
mod focus;
mod hwnd;
mod paste;

pub use activate::activate_focus_target;
pub use focus::{
    capture_foreground_hwnd, is_foreground_ours, is_foreground_target, is_our_process_hwnd,
    prepare_focus_handoff,
};
pub use paste::simulate_ctrl_v;
