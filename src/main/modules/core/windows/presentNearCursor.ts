import { BrowserWindow, screen } from 'electron'

/** 跳过 UIElement 变换，避免 Dock 闪隐 / 搅乱 activationPolicy */
const SKIP_TRANSFORM = { skipTransformProcessType: true } as const

/**
 * 呼出跟鼠标：屏跟光标所在显示器；macOS 再迁到当前 Space。
 * Windows 虚拟桌面无公开等价 API：窗留在创建时桌面；ESC 不还焦见 dismissFloatingStayInApp，
 * 避免 SetForegroundWindow / setFocusable(false) 把用户拽到上一窗所在桌面。
 */

/** 浮层：鼠标所在屏顶部水平居中 */
export function placeOverlayOnCursorDisplay(win: BrowserWindow, topOffset: number): void {
  if (win.isDestroyed()) return
  const cursor = screen.getCursorScreenPoint()
  const { workArea } = screen.getDisplayNearestPoint(cursor)
  const [w] = win.getSize()
  const x = workArea.x + Math.round((workArea.width - w) / 2)
  const y = workArea.y + topOffset
  win.setPosition(x, y, false)
}

/** 普通窗：鼠标所在屏工作区居中 */
export function centerOnCursorDisplay(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  const cursor = screen.getCursorScreenPoint()
  const { workArea } = screen.getDisplayNearestPoint(cursor)
  const [w, h] = win.getSize()
  const x = workArea.x + Math.round((workArea.width - w) / 2)
  const y = workArea.y + Math.round((workArea.height - h) / 2)
  win.setPosition(x, y, false)
}

/**
 * macOS：短暂 CanJoinAllSpaces 再关掉，把窗口迁到当前桌面。
 * Windows：无 Spaces API，直接 present（虚拟桌面亲和由系统管；关浮层勿强制还焦外部）。
 */
export function presentOnActiveSpace(win: BrowserWindow, present: () => void): void {
  if (process.platform !== 'darwin' || win.isDestroyed()) {
    present()
    return
  }

  win.setVisibleOnAllWorkspaces(true, SKIP_TRANSFORM)
  present()
  // 下一 tick 再关：确保已挂到当前 Space
  setTimeout(() => {
    if (win.isDestroyed()) return
    win.setVisibleOnAllWorkspaces(false, SKIP_TRANSFORM)
  }, 0)
}
