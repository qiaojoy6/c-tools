//! HWND ↔ `hwnd:<u64>` token

use windows::Win32::Foundation::HWND;

pub const TOKEN_PREFIX: &str = "hwnd:";

pub fn hwnd_to_u64(h: HWND) -> u64 {
    h.0 as usize as u64
}

pub fn u64_to_hwnd(n: u64) -> HWND {
    HWND(n as usize as *mut _)
}

pub fn hwnd_to_token(h: HWND) -> Option<String> {
    let n = hwnd_to_u64(h);
    if n == 0 {
        return None;
    }
    Some(format!("{TOKEN_PREFIX}{n}"))
}

pub fn token_to_hwnd(token: &str) -> Option<HWND> {
    let rest = token.strip_prefix(TOKEN_PREFIX)?;
    let n: u64 = rest.parse().ok()?;
    if n == 0 {
        return None;
    }
    Some(u64_to_hwnd(n))
}

/// 窗口所属进程 id；失败为 0
pub fn window_pid(h: HWND) -> u32 {
    use windows::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId;
    let mut pid = 0u32;
    unsafe {
        GetWindowThreadProcessId(h, Some(&mut pid));
    }
    pid
}
