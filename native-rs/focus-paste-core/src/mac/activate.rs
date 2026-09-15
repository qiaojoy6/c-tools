//! 激活外部目标应用（粘贴前）

use std::process::Command;

use crate::FocusPasteError;

/// `tell application id "..." to activate`
pub fn activate_focus_target(bundle_id: &str) -> Result<bool, FocusPasteError> {
    // 简单转义：bundle id 不含引号；仍防注入
    if bundle_id.contains('"') || bundle_id.contains('\\') {
        return Err(FocusPasteError::Mac("invalid bundle id".into()));
    }
    let script = format!("tell application id \"{bundle_id}\" to activate");
    let status = Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .status()
        .map_err(|e| FocusPasteError::Mac(e.to_string()))?;
    Ok(status.success())
}
