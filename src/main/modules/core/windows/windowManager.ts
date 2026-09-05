import type { AppConfig } from '@shared/types'
import { app } from 'electron'
import { execFile } from 'child_process'
import { delay } from './loadRoute'
import { ClipboardWindow } from './clipboardWindow'
import { PanelWindow, type PanelShowOptions } from './panelWindow'
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

  /** 隐藏独立剪贴板浮层（ESC；不影响功能面板） */
  hideClipboard(): void {
    this.clipboard.hide()
  }

  /** IPC `panel:hide` 兼容名 → 仅关剪贴板浮层 */
  hidePanel(): void {
    this.hideClipboard()
  }

  /** 同时隐藏两者（粘贴到外部应用时） */
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
    else this.panel.show({ captureFocus: false })
  }

  showSettings(): void {
    this.settings.show()
  }

  hideSettings(): void {
    this.settings.hide()
  }

  /**
   * 粘贴前恢复焦点：
   * - 功能面板与独立剪贴板同时开着 → 只关浮层，焦点回到面板（可贴进面板输入框）
   * - 否则关掉浮层/面板，并激活呼出前的外部应用
   */
  async restorePreviousFocus(): Promise<boolean> {
    const pasteIntoPanel = this.panel.isVisible() && this.clipboard.isVisible()
    const bundleId =
      this.clipboard.takePreviousAppBundleId() ?? this.panel.takePreviousAppBundleId()

    if (pasteIntoPanel) {
      this.hideClipboard()
      this.focusPanel()
      await delay(RESTORE_FOCUS_DELAY_MS)
      return true
    }

    this.hideAllOverlays()

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

  /** 仅把焦点还给功能面板（不触发 panel:shown，避免重置面板内状态） */
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
