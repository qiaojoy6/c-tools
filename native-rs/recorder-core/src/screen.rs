//! 屏幕枚举与单帧捕获（xcap）

use crate::types::{DeviceInfo, DeviceType};
use crate::RecorderError;
use xcap::Monitor;

/// 枚举所有显示器
pub fn list_screens() -> Result<Vec<DeviceInfo>, RecorderError> {
    let monitors = Monitor::all().map_err(|e| RecorderError::Capture(e.to_string()))?;
    let mut out = Vec::with_capacity(monitors.len());
    for m in monitors {
        out.push(device_from_monitor(&m)?);
    }
    Ok(out)
}

/// 按 id 查找显示器；id 为空则取主屏
pub fn resolve_monitor(screen_id: Option<&str>) -> Result<Monitor, RecorderError> {
    let monitors = Monitor::all().map_err(|e| RecorderError::Capture(e.to_string()))?;
    if monitors.is_empty() {
        return Err(RecorderError::NoScreen);
    }

    if let Some(id) = screen_id.filter(|s| !s.is_empty()) {
        for m in &monitors {
            if monitor_id(m) == id {
                return Ok(m.clone());
            }
        }
        return Err(RecorderError::ScreenNotFound(id.to_string()));
    }

    // 优先主屏
    for m in &monitors {
        if m.is_primary().unwrap_or(false) {
            return Ok(m.clone());
        }
    }
    Ok(monitors.into_iter().next().expect("non-empty"))
}

fn device_from_monitor(m: &Monitor) -> Result<DeviceInfo, RecorderError> {
    Ok(DeviceInfo {
        id: monitor_id(m),
        name: m
            .name()
            .unwrap_or_else(|_| format!("Display {}", monitor_id(m))),
        device_type: DeviceType::Screen,
        width: m.width().unwrap_or(0),
        height: m.height().unwrap_or(0),
        is_primary: m.is_primary().unwrap_or(false),
    })
}

/// 稳定 id：优先用平台 id，否则用 name+尺寸
fn monitor_id(m: &Monitor) -> String {
    if let Ok(id) = m.id() {
        return id.to_string();
    }
    let name = m.name().unwrap_or_else(|_| "screen".into());
    let w = m.width().unwrap_or(0);
    let h = m.height().unwrap_or(0);
    format!("{name}-{w}x{h}")
}
