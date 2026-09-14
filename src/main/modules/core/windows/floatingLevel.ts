import type { BrowserWindow } from 'electron'

/**
 * 独立浮层（剪贴板 / 快捷文件夹）置顶层级。
 * macOS 用 `floating`：仍压在普通应用之上，但低于输入法候选窗（`screen-saver` 会盖住候选）。
 * 不用 visibleOnAllWorkspaces（会扰乱 Spaces / Cmd+Tab）。
 */
export function applyOverlayFloatingLevel(win: BrowserWindow, alwaysOnTop: boolean): void {
  if (!alwaysOnTop) {
    win.setAlwaysOnTop(false)
    return
  }
  if (process.platform === 'darwin') {
    win.setAlwaysOnTop(true, 'floating')
    return
  }
  win.setAlwaysOnTop(true)
}
