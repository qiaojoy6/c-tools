//! macOS：前台 bundle id / 激活 / 模拟 ⌘V（osascript）

mod activate;
mod focus;
mod paste;

pub use activate::activate_focus_target;
pub use focus::{get_frontmost_bundle_id, get_own_bundle_id};
pub use paste::simulate_cmd_v;
