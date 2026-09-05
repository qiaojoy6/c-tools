import type { AppConfig } from '@shared/types'
import { app } from 'electron'
import { delay } from './loadRoute'
import { ClipboardWindow } from './clipboardWindow'
import { PanelWindow, type PanelShowOptions } from './panelWindow'
import { SettingsWindow } from './settingsWindow'
import { activateFocusTarget, asExternalBundleId, isOurAppForeground } from './focusTarget'

const RESTORE_FOCUS_DELAY_MS = process.platform === 'win32' ? 180 : 120

/**
 * 窗口枢纽：独立剪贴板浮层 + 功能面板 + 设置窗
 */
export class WindowManager {
  private quitting = false
  /** 最近一次外部前台应用，面板内粘贴时的回落目标 */
  private lastExternalBundleId: string | null = null
  readonly clipboard: ClipboardWindow
  readonly panel: PanelWindow
  readonly settings: SettingsWindow

  constructor(getConfig: () => AppConfig) {
    const isQuitting = (): boolean => this.quitting
    this.clipboard = new ClipboardWindow(getConfig, isQuitting)
    this.panel = new PanelWindow(isQuitting)
    this.settings = new SettingsWindow(isQuitting)

    const remember = (id: string): void => {
      this.lastExternalBundleId = id
    }
    this.panel.onExternalAppCaptured = remember
    this.clipboard.onExternalAppCaptured = remember
  }

  markQuitting(): void {
    this.quitting = true
  }

  get panelWindow() {
    return this.panel.browserWindow
  }

  get clipboardWindow() {
    return this.clipboard.browserWindow
  }

  get settingsWindow() {
    return this.settings.browserWindow
  }

  get onSettingsClosed(): (() => void) | null {
    return this.settings.onClosed
  }

  set onSettingsClosed(fn: (() => void) | null) {
    this.settings.onClosed = fn
  }

  isVisible(): boolean {
    return this.clipboard.isVisible() || this.panel.isVisible()
  }

  /** 预创建剪贴板 + 功能面板（隐藏），避免首次点程序坞再冷创建 */
  createPanel(): void {
    this.clipboard.create()
    this.panel.create()
  }

  showClipboard(): void {
    this.clipboard.show()
  }

  showPanel(opts?: PanelShowOptions): void {
    this.panel.show(opts)
  }

  hideClipboard(): void {
    this.clipboard.hide()
  }

  hidePanel(): void {
    this.hideClipboard()
  }

  hideAllOverlays(): void {
    this.clipboard.hide()
    this.panel.hide()
  }

  toggleClipboard(): void {
    if (this.clipboard.isVisible()) this.clipboard.hide()
    else this.clipboard.show()
  }

  togglePanel(): void {
    if (this.panel.isVisible()) this.panel.hide()
    else this.panel.show()
  }

  showSettings(): void {
    this.settings.show()
  }

  hideSettings(): void {
    this.settings.hide()
  }

  /**
   * 粘贴前恢复焦点：
   * - 面板 + 独立浮层同时开 → 只关浮层，焦点回面板（贴进本软件）
   * - 仅面板内剪贴板 → 关面板，激活呼出前 / 最近外部应用
   * - 仅浮层 → 关浮层，激活呼出前外部应用
   */
  async restorePreviousFocus(): Promise<boolean> {
    const pasteIntoPanel = this.panel.isVisible() && this.clipboard.isVisible()

    if (pasteIntoPanel) {
      this.clipboard.takePreviousAppBundleId()
      this.panel.takePreviousAppBundleId()
      this.hideClipboard()
      this.focusPanel()
      await delay(RESTORE_FOCUS_DELAY_MS)
      return true
    }

    const bundleId = asExternalBundleId(
      this.clipboard.takePreviousAppBundleId() ??
        this.panel.takePreviousAppBundleId() ??
        this.lastExternalBundleId
    )

    this.hideAllOverlays()

    // macOS：必须能 activate 到外部 app，否则 Cmd+V 会落到本进程
    if (process.platform === 'darwin') {
      if (!bundleId) return false
      const ok = await activateFocusTarget(bundleId)
      if (!ok) return false
      await delay(RESTORE_FOCUS_DELAY_MS)
      return true
    }

    // Windows：隐藏浮层后系统常自动还原上一前台窗；有 hwnd 则再强制激活。
    // 若隐藏后前台仍是本应用，Ctrl+V 无效 → 返回 false 供提示（勿假装成功）。
    if (process.platform === 'win32') {
      if (bundleId) {
        await activateFocusTarget(bundleId)
      }
      await delay(RESTORE_FOCUS_DELAY_MS)
      if (isOurAppForeground()) {
        if (bundleId) {
          await activateFocusTarget(bundleId)
          await delay(100)
        }
        if (isOurAppForeground()) return false
      }
      return true
    }

    await delay(RESTORE_FOCUS_DELAY_MS)
    return true
  }

  private focusPanel(): void {
    const win = this.panel.browserWindow
    if (!win || win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    if (!win.isVisible()) win.show()
    win.moveTop()
    win.focus()
    if (process.platform === 'darwin') {
      app.focus({ steal: true })
    }
  }
}
