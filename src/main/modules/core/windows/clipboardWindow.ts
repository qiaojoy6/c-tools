import { BrowserWindow } from 'electron'
import { join } from 'path'
import type { AppConfig } from '@shared/types'
import { loadRoute } from './loadRoute'
import { asExternalBundleId, getFrontmostBundleId } from './focusTarget'
import { applyOverlayFloatingLevel } from './floatingLevel'
import { placeOverlayOnCursorDisplay, presentOnActiveSpace } from './presentNearCursor'
import { reassertMacDockHiddenIfNeeded } from './macDockIcon'

/**
 * 独立剪贴板浮层：无边框、置顶、失焦隐藏；由全局快捷键呼出。
 * 呼出跟随鼠标所在屏（顶部居中）+ 当前桌面；macOS 不用 type:panel；
 * showInactive + 不调 app.focus，避免抬起功能面板。
 */
export class ClipboardWindow {
  private win: BrowserWindow | null = null
  private previousAppBundleId: string | null = null

  /** 采到外部前台应用时回调 */
  onExternalAppCaptured: ((bundleId: string) => void) | null = null

  constructor(
    private getConfig: () => AppConfig,
    private isQuitting: () => boolean
  ) {}

  get browserWindow(): BrowserWindow | null {
    return this.win
  }

  isVisible(): boolean {
    return this.win?.isVisible() ?? false
  }

  create(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win

    const cfg = this.getConfig().window
    const win = new BrowserWindow({
      width: cfg.width,
      height: cfg.height,
      minWidth: cfg.minWidth,
      minHeight: cfg.minHeight,
      show: false,
      frame: false,
      transparent: cfg.transparent,
      alwaysOnTop: cfg.alwaysOnTop,
      skipTaskbar: cfg.skipTaskbar,
      resizable: cfg.resizable,
      fullscreenable: false,
      maximizable: false,
      hasShadow: true,
      autoHideMenuBar: true,
      ...(process.platform === 'darwin' ? { roundedCorners: false } : {}),
      backgroundColor: cfg.transparent ? '#00000000' : undefined,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    this.applyFloatingLevel(win)

    win.on('blur', () => {
      if (this.getConfig().window.hideOnBlur) this.hide()
    })

    win.on('close', (e) => {
      if (!this.isQuitting()) {
        e.preventDefault()
        this.hide()
      }
    })

    loadRoute(win, '/clipboard')
    this.win = win
    return win
  }

  show(): void {
    void this.showAsync()
  }

  private async showAsync(): Promise<void> {
    const win = this.win ?? this.create()
    if (win.isDestroyed()) return

    await this.capturePreviousFocusTargetAsync()
    if (win.isDestroyed()) return

    placeOverlayOnCursorDisplay(win, this.getConfig().window.topOffset)
    if (win.isMinimized()) win.restore()
    this.applyFloatingLevel(win)

    // 不调 app.focus；mac 用 showInactive，避免抬起功能面板 / 程序坞
    presentOnActiveSpace(win, () => {
      if (process.platform === 'darwin') {
        win.showInactive()
        win.focus()
        reassertMacDockHiddenIfNeeded()
        return
      }
      win.show()
      win.focus()
    })
    win.webContents.send('panel:shown')
  }

  /**
   * @param opts.yieldFocus 默认 true：关窗并让出焦点（粘贴 / 失焦隐藏）。
   *   false：仅隐藏、不让焦——Win 上避免 setFocusable(false) 把焦点（及虚拟桌面）甩给上一窗。
   */
  hide(opts?: { yieldFocus?: boolean }): void {
    if (!this.win?.isVisible()) return
    const yieldFocus = opts?.yieldFocus !== false

    if (process.platform === 'win32') {
      this.win.setAlwaysOnTop(false)
      if (yieldFocus) {
        if (this.win.isFocused()) this.win.blur()
        this.win.setFocusable(false)
        this.win.hide()
        this.win.setFocusable(true)
      } else {
        this.win.hide()
      }
      return
    }

    // mac：让焦时先 blur，避免隐藏后仍被当成「上次焦点窗」，Cmd+Tab 切回无界面
    if (yieldFocus && this.win.isFocused()) this.win.blur()
    this.win.hide()
  }

  takePreviousAppBundleId(): string | null {
    const id = this.previousAppBundleId
    this.previousAppBundleId = null
    return id
  }

  clearPreviousAppBundleId(): void {
    this.previousAppBundleId = null
  }

  /** Windows：快捷键瞬间写入外部目标，避免 show 异步采焦丢失 */
  seedPreviousAppBundleId(bundleId: string): void {
    if (!bundleId || asExternalBundleId(bundleId) == null) return
    this.previousAppBundleId = bundleId
    this.onExternalAppCaptured?.(bundleId)
  }

  /** 浮层置顶：压住普通应用，但不盖输入法候选 */
  private applyFloatingLevel(win: BrowserWindow): void {
    applyOverlayFloatingLevel(win, this.getConfig().window.alwaysOnTop)
  }

  private async capturePreviousFocusTargetAsync(): Promise<void> {
    const raw = await getFrontmostBundleId()
    const external = asExternalBundleId(raw)
    if (external) {
      this.previousAppBundleId = external
      this.onExternalAppCaptured?.(external)
      return
    }
    // Win：异步采焦若已落到本应用，保留快捷键同步 seed；Mac：本应用内呼出则清空
    if (process.platform === 'win32' && this.previousAppBundleId) return
    this.previousAppBundleId = null
  }
}
