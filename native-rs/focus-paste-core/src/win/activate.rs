//! 激活外部目标窗口（粘贴前）

use super::focus::is_foreground_target;
use super::hwnd::token_to_hwnd;
use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    keybd_event, SetActiveWindow, KEYEVENTF_KEYUP, VK_MENU,
};
use windows::Win32::UI::WindowsAndMessaging::{
    AllowSetForegroundWindow, BringWindowToTop, GetForegroundWindow, GetWindowThreadProcessId,
    IsIconic, IsWindow, LockSetForegroundWindow, SetForegroundWindow, SetWindowPos, ShowWindow,
    SystemParametersInfoW, SwitchToThisWindow, HWND_TOP, LSFW_UNLOCK, SPI_GETFOREGROUNDLOCKTIMEOUT,
    SPI_SETFOREGROUNDLOCKTIMEOUT, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, SW_RESTORE, SW_SHOW,
    SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS,
};

/// 激活 `hwnd:<n>` 目标；成功则前台已落到目标（或同进程窗）
pub fn activate_focus_target(token: &str) -> bool {
    let Some(h) = token_to_hwnd(token) else {
        return false;
    };
    unsafe {
        if !IsWindow(h).as_bool() {
            return false;
        }
        if IsIconic(h).as_bool() {
            let _ = ShowWindow(h, SW_RESTORE);
        }

        let mut target_pid = 0u32;
        let target_tid = GetWindowThreadProcessId(h, Some(&mut target_pid));
        if target_pid != 0 {
            let _ = AllowSetForegroundWindow(target_pid);
        }
        let _ = LockSetForegroundWindow(LSFW_UNLOCK);

        // Alt 空按，放宽前台限制
        keybd_event(VK_MENU.0 as u8, 0, Default::default(), 0);
        keybd_event(VK_MENU.0 as u8, 0, KEYEVENTF_KEYUP, 0);

        let fg = GetForegroundWindow();
        let mut fg_pid = 0u32;
        let fore_tid = if fg.0.is_null() {
            0
        } else {
            GetWindowThreadProcessId(fg, Some(&mut fg_pid))
        };
        let cur_tid = GetCurrentThreadId();

        let mut attached_fore = false;
        let mut attached_target = false;
        let mut attached_cross = false;

        if fore_tid != 0 && fore_tid != cur_tid {
            attached_fore = AttachThreadInput(cur_tid, fore_tid, true).as_bool();
        }
        if target_tid != 0 && target_tid != cur_tid && target_tid != fore_tid {
            attached_target = AttachThreadInput(cur_tid, target_tid, true).as_bool();
        }
        if fore_tid != 0 && target_tid != 0 && fore_tid != target_tid {
            attached_cross = AttachThreadInput(fore_tid, target_tid, true).as_bool();
        }

        with_foreground_lock_disabled(|| {
            let _ = ShowWindow(h, SW_SHOW);
            let _ = BringWindowToTop(h);
            let _ = SetWindowPos(
                h,
                HWND_TOP,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
            );
            let _ = SetForegroundWindow(h);
            let _ = SetActiveWindow(h);
        });

        if attached_cross {
            let _ = AttachThreadInput(fore_tid, target_tid, false);
        }
        if attached_target {
            let _ = AttachThreadInput(cur_tid, target_tid, false);
        }
        if attached_fore {
            let _ = AttachThreadInput(cur_tid, fore_tid, false);
        }

        // own_pid=0：只比目标，不把「本进程」当否决
        if !is_foreground_target(token, 0) {
            SwitchToThisWindow(h, true);
            let _ = SetForegroundWindow(h);
        }

        is_foreground_target(token, 0)
    }
}

/// 临时清零前台锁超时，提高 SetForegroundWindow 成功率
fn with_foreground_lock_disabled(fn_: impl FnOnce()) {
    let mut prev: u32 = 0;
    let had_prev = unsafe {
        SystemParametersInfoW(
            SPI_GETFOREGROUNDLOCKTIMEOUT,
            0,
            Some(&mut prev as *mut u32 as *mut _),
            SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
        )
        .is_ok()
    };
    unsafe {
        let mut zero: u32 = 0;
        let _ = SystemParametersInfoW(
            SPI_SETFOREGROUNDLOCKTIMEOUT,
            0,
            Some(&mut zero as *mut u32 as *mut _),
            SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
        );
    }
    fn_();
    if had_prev {
        unsafe {
            let _ = SystemParametersInfoW(
                SPI_SETFOREGROUNDLOCKTIMEOUT,
                0,
                Some(&mut prev as *mut u32 as *mut _),
                SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
            );
        }
    }
}
