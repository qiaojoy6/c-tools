//! 前台采集与还焦准备

use super::hwnd::{hwnd_to_token, token_to_hwnd, window_pid};
use windows::Win32::UI::WindowsAndMessaging::{
    AllowSetForegroundWindow, GetForegroundWindow, LockSetForegroundWindow, ASFW_ANY, LSFW_UNLOCK,
};

/// 同步采前台 hwnd；属于 own_pid 则返回 None
pub fn capture_foreground_hwnd(own_pid: u32) -> Option<String> {
    let h = unsafe { GetForegroundWindow() };
    let token = hwnd_to_token(h)?;
    if window_pid(h) == own_pid {
        return None;
    }
    Some(token)
}

/// hide 浮层前放行目标抢焦点（须在本进程仍占前台时调用）
pub fn prepare_focus_handoff(token: &str) -> Result<(), crate::FocusPasteError> {
    let h = token_to_hwnd(token).ok_or_else(|| {
        crate::FocusPasteError::InvalidToken(token.to_string())
    })?;
    unsafe {
        let _ = LockSetForegroundWindow(LSFW_UNLOCK);
        let pid = window_pid(h);
        if pid != 0 {
            let _ = AllowSetForegroundWindow(pid);
        }
        let _ = AllowSetForegroundWindow(ASFW_ANY);
    }
    Ok(())
}

/// 句柄是否属于 own_pid
pub fn is_our_process_hwnd(token: &str, own_pid: u32) -> bool {
    let Some(h) = token_to_hwnd(token) else {
        return false;
    };
    let pid = window_pid(h);
    pid != 0 && pid == own_pid
}

/// 当前前台是否属于本进程
pub fn is_foreground_ours(own_pid: u32) -> bool {
    let h = unsafe { GetForegroundWindow() };
    let pid = window_pid(h);
    pid != 0 && pid == own_pid
}

/// 当前前台是否已是目标 hwnd（或同进程其它顶层窗）
pub fn is_foreground_target(token: &str, own_pid: u32) -> bool {
    let Some(target) = token_to_hwnd(token) else {
        return false;
    };
    let fg = unsafe { GetForegroundWindow() };
    let Some(fg_token) = hwnd_to_token(fg) else {
        return false;
    };
    if fg_token == token {
        return true;
    }
    if window_pid(fg) == own_pid {
        return false;
    }
    let a = window_pid(target);
    let b = window_pid(fg);
    a != 0 && a == b
}
