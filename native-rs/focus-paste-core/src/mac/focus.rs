//! 前台 / 本进程 bundle id

use std::process::Command;

use crate::FocusPasteError;

/// 本进程 bundle id（按 unix pid）
pub fn get_own_bundle_id(pid: u32) -> Result<Option<String>, FocusPasteError> {
    let script = format!(
        "tell application \"System Events\" to get bundle identifier of first process whose unix id is {pid}"
    );
    run_osascript(&script)
}

/// 当前前台应用 bundle id
pub fn get_frontmost_bundle_id() -> Result<Option<String>, FocusPasteError> {
    let script = "tell application \"System Events\" to get bundle identifier of first application process whose frontmost is true";
    run_osascript(script)
}

fn run_osascript(script: &str) -> Result<Option<String>, FocusPasteError> {
    let output = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|e| FocusPasteError::Mac(e.to_string()))?;
    if !output.status.success() {
        return Ok(None);
    }
    let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(if s.is_empty() { None } else { Some(s) })
}
