//! Electron 用 napi 胶水：焦点采集 / 还焦 / 模拟粘贴

#![deny(clippy::all)]

use napi::bindgen_prelude::*;
use napi_derive::napi;

// ---------- Windows ----------

/// 同步采前台 hwnd；属于 ownPid 则返回 null
#[napi(js_name = "captureForegroundHwnd")]
pub fn capture_foreground_hwnd(own_pid: u32) -> Option<String> {
    #[cfg(windows)]
    {
        focus_paste_core::win::capture_foreground_hwnd(own_pid)
    }
    #[cfg(not(windows))]
    {
        let _ = own_pid;
        None
    }
}

/// hide 前放行目标抢焦点
#[napi(js_name = "prepareFocusHandoff")]
pub fn prepare_focus_handoff(token: String) -> Result<()> {
    #[cfg(windows)]
    {
        focus_paste_core::win::prepare_focus_handoff(&token)
            .map_err(|e| Error::from_reason(e.to_string()))
    }
    #[cfg(not(windows))]
    {
        let _ = token;
        Ok(())
    }
}

/// 句柄是否属于本进程
#[napi(js_name = "isOurProcessHwnd")]
pub fn is_our_process_hwnd(token: String, own_pid: u32) -> bool {
    #[cfg(windows)]
    {
        focus_paste_core::win::is_our_process_hwnd(&token, own_pid)
    }
    #[cfg(not(windows))]
    {
        let _ = (token, own_pid);
        false
    }
}

/// 当前前台是否属于本进程
#[napi(js_name = "isForegroundOurs")]
pub fn is_foreground_ours(own_pid: u32) -> bool {
    #[cfg(windows)]
    {
        focus_paste_core::win::is_foreground_ours(own_pid)
    }
    #[cfg(not(windows))]
    {
        let _ = own_pid;
        false
    }
}

/// 当前前台是否已是目标（或同进程窗）
#[napi(js_name = "isForegroundTarget")]
pub fn is_foreground_target(token: String, own_pid: u32) -> bool {
    #[cfg(windows)]
    {
        focus_paste_core::win::is_foreground_target(&token, own_pid)
    }
    #[cfg(not(windows))]
    {
        let _ = (token, own_pid);
        false
    }
}

/// 激活目标窗口（Win：hwnd token；mac：bundle id）
#[napi(js_name = "activateFocusTarget")]
pub fn activate_focus_target(token: String) -> bool {
    #[cfg(windows)]
    {
        focus_paste_core::win::activate_focus_target(&token)
    }
    #[cfg(target_os = "macos")]
    {
        focus_paste_core::mac::activate_focus_target(&token).unwrap_or(false)
    }
    #[cfg(all(not(windows), not(target_os = "macos")))]
    {
        let _ = token;
        false
    }
}

/// 立刻模拟 Ctrl+V（Win）；不含延时
#[napi(js_name = "simulateCtrlV")]
pub fn simulate_ctrl_v() -> bool {
    #[cfg(windows)]
    {
        focus_paste_core::win::simulate_ctrl_v()
    }
    #[cfg(not(windows))]
    {
        false
    }
}

// ---------- macOS ----------

/// 本进程 bundle id
#[napi(js_name = "getOwnBundleId")]
pub fn get_own_bundle_id(pid: u32) -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        focus_paste_core::mac::get_own_bundle_id(pid).ok().flatten()
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = pid;
        None
    }
}

/// 当前前台 bundle id
#[napi(js_name = "getFrontmostBundleId")]
pub fn get_frontmost_bundle_id() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        focus_paste_core::mac::get_frontmost_bundle_id().ok().flatten()
    }
    #[cfg(not(target_os = "macos"))]
    {
        None
    }
}

/// 立刻模拟 ⌘V（mac）；不含延时
#[napi(js_name = "simulateCmdV")]
pub fn simulate_cmd_v() -> bool {
    #[cfg(target_os = "macos")]
    {
        focus_paste_core::mac::simulate_cmd_v().unwrap_or(false)
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}
