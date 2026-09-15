//! 模拟 Ctrl+V（SendInput 优先，失败回退 keybd_event）

use windows::Win32::UI::Input::KeyboardAndMouse::{
    keybd_event, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VIRTUAL_KEY,
    VK_CONTROL, VK_MENU, VK_SHIFT, VK_V,
};

/// 立刻发送 Ctrl+V（不含延时；延时由 TS 编排）
pub fn simulate_ctrl_v() -> bool {
    if send_input_ctrl_v() {
        return true;
    }
    keybd_event_ctrl_v()
}

fn release_modifiers() {
    unsafe {
        for vk in [VK_SHIFT, VK_CONTROL, VK_MENU] {
            keybd_event(vk.0 as u8, 0, KEYEVENTF_KEYUP, 0);
        }
    }
}

fn keybd_event_ctrl_v() -> bool {
    unsafe {
        release_modifiers();
        keybd_event(VK_CONTROL.0 as u8, 0, Default::default(), 0);
        keybd_event(VK_V.0 as u8, 0, Default::default(), 0);
        keybd_event(VK_V.0 as u8, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_CONTROL.0 as u8, 0, KEYEVENTF_KEYUP, 0);
    }
    true
}

fn send_input_ctrl_v() -> bool {
    // 先抬起修饰键，再 Ctrl+V
    let entries: [(VIRTUAL_KEY, bool); 7] = [
        (VK_SHIFT, true),
        (VK_MENU, true),
        (VK_CONTROL, true),
        (VK_CONTROL, false),
        (VK_V, false),
        (VK_V, true),
        (VK_CONTROL, true),
    ];

    let mut inputs: Vec<INPUT> = entries
        .iter()
        .map(|(vk, up)| INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: *vk,
                    wScan: 0,
                    dwFlags: if *up {
                        KEYEVENTF_KEYUP
                    } else {
                        Default::default()
                    },
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        })
        .collect();

    unsafe {
        let sent = SendInput(&mut inputs, std::mem::size_of::<INPUT>() as i32);
        sent == entries.len() as u32
    }
}
