import type { AppConfig } from '@shared/types'
import { app } from 'electron'
import { delay } from './loadRoute'
import { ClipboardWindow } from './clipboardWindow'
import { PanelWindow, type PanelShowOptions } from './panelWindow'
import { SettingsWindow } from './settingsWindow'
import { activateFocusTarget, asExternalBundleId } from './focusTarget'

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

    // 没有外部目标：粘贴会落到空处
    if (!bundleId) {
      if (process.platform === 'darwin' || process.platform === 'win32') return false
      return true
    }

    const ok = await activateFocusTarget(bundleId)
    if (!ok) return false
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
