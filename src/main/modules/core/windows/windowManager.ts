import type { AppConfig } from '@shared/types'
import { execFile } from 'child_process'
import { delay } from './loadRoute'
import { ClipboardWindow } from './clipboardWindow'
import { PanelWindow } from './panelWindow'
import { SettingsWindow } from './settingsWindow'

const RESTORE_FOCUS_DELAY_MS = 100

/**
 * 窗口枢纽：独立剪贴板浮层 + 功能面板 + 设置窗
 */
export class WindowManager {
  private quitting = false
  readonly clipboard: ClipboardWindow
  readonly panel: PanelWindow
  readonly settings: SettingsWindow

  constructor(getConfig: () => AppConfig) {
    const isQuitting = (): boolean => this.quitting
    this.clipboard = new ClipboardWindow(getConfig, isQuitting)
    this.panel = new PanelWindow(isQuitting)
    this.settings = new SettingsWindow(isQuitting)
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

  /** 预创建独立剪贴板（快捷键主路径） */
  createPanel() {
    return this.clipboard.create()
  }

  showClipboard(): void {
    this.panel.hide()
    this.clipboard.show()
  }

  showPanel(): void {
    this.clipboard.hide()
    this.panel.show()
  }

  hidePanel(): void {
    this.clipboard.hide()
    this.panel.hide()
  }

  toggleClipboard(): void {
    if (this.clipboard.isVisible()) this.clipboard.hide()
    else this.showClipboard()
  }

  togglePanel(): void {
    if (this.panel.isVisible()) this.panel.hide()
    else this.showPanel()
  }

  showSettings(): void {
    this.settings.show()
  }

  hideSettings(): void {
    this.settings.hide()
  }

  /**
   * 粘贴前：关闭剪贴板/面板并恢复呼出前应用焦点（macOS）
   * 优先使用最近呼出窗口捕获的 bundle id
   */
  async restorePreviousFocus(): Promise<boolean> {
    const bundleId =
      this.clipboard.takePreviousAppBundleId() ?? this.panel.takePreviousAppBundleId()

    this.clipboard.hide()
    this.panel.hide()

    if (process.platform !== 'darwin') {
      return true
    }
    if (!bundleId) return true

    return new Promise((resolve) => {
      execFile(
        'osascript',
        ['-e', `tell application id "${bundleId}" to activate`],
        async (err) => {
          if (err) {
            resolve(false)
            return
          }
          await delay(RESTORE_FOCUS_DELAY_MS)
          resolve(true)
        }
      )
    })
  }
}
