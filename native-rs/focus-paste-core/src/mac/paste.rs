//! 模拟 ⌘V

use std::io::Read;
use std::process::{Command, Stdio};

use crate::FocusPasteError;

/// System Events keystroke "v" using command down
pub fn simulate_cmd_v() -> Result<bool, FocusPasteError> {
    let mut child = Command::new("osascript")
        .arg("-e")
        .arg("tell application \"System Events\" to keystroke \"v\" using command down")
        .stderr(Stdio::piped())
        .stdout(Stdio::null())
        .spawn()
        .map_err(|e| FocusPasteError::Mac(e.to_string()))?;

    let mut stderr = String::new();
    if let Some(mut err) = child.stderr.take() {
        let _ = err.read_to_string(&mut stderr);
    }
    let status = child
        .wait()
        .map_err(|e| FocusPasteError::Mac(e.to_string()))?;

    if is_accessibility_denied(&stderr) {
        return Ok(false);
    }
    Ok(status.success())
}

fn is_accessibility_denied(stderr: &str) -> bool {
    let s = stderr.to_lowercase();
    s.contains("not allowed")
        || s.contains("1002")
        || s.contains("1743")
        || s.contains("辅助功能")
        || s.contains("accessibility")
}
