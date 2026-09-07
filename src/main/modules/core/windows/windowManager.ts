import type { AppConfig } from '@shared/types'
import { app } from 'electron'
import { delay } from './loadRoute'
import { ClipboardWindow } from './clipboardWindow'
import { PanelWindow, type PanelShowOptions } from './panelWindow'
import { SettingsWindow } from './settingsWindow'
import {
  activateFocusTarget,
  asExternalBundleId,
  captureWindowsForegroundHwnd,
  getFrontmostBundleId,
  isWindowsForegroundOurs,
  isWindowsForegroundTarget,
  prepareWindowsFocusHandoff
} from './focusTarget'

const RESTORE_FOCUS_DELAY_MS = process.platform === 'win32' ? 220 : 120

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
    this.panel = new PanelWindow(isQuitting, () => getConfig().general.theme)
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

  /**
   * 快捷键呼出独立剪贴板。
   * 不改功能面板显隐/层级（macOS 靠 type:panel + 不调用 app.focus）。
   */
  showClipboard(): void {
    this.clipboard.show()
  }

  showPanel(opts?: PanelShowOptions): void {
    this.panel.show(opts)
  }

  hideClipboard(): void {
    this.clipboard.hide()
  }

  /** IPC `panel:hide`：只关独立剪贴板浮层（历史命名；功能面板不关） */
  hidePanel(): void {
    this.hideClipboard()
  }

  hideAllOverlays(): void {
    this.clipboard.hide()
    this.panel.hide()
  }

  toggleClipboard(): void {
    if (this.clipboard.isVisible()) this.hideClipboard()
    else this.showClipboard()
  }

  /**
   * Windows：快捷键回调里同步记下当前前台，再 show 浮层。
   * 必须在 toggle/show 之前调用，避免采焦时已经是本应用。
   */
  noteForegroundBeforeShow(): void {
    if (process.platform !== 'win32') return
    const token = asExternalBundleId(captureWindowsForegroundHwnd())
    if (!token) return
    this.lastExternalBundleId = token
    this.clipboard.seedPreviousAppBundleId(token)
  }

  /** 显示 / 隐藏功能面板（托盘右键菜单） */
  togglePanel(): void {
    if (this.panel.isVisible()) this.panel.hide()
    else this.showPanel()
  }

  showSettings(): void {
    this.settings.show()
  }

  /**
   * 截屏开始前采外部前台：当前前台优先，失败则用面板失焦时记下的目标
   * （打开面板 → 切到其它软件盖住 → 截屏，依赖这条回落）
   */
  async captureScreenshotExternalFocus(): Promise<string | null> {
    if (process.platform === 'win32') {
      const hwnd = asExternalBundleId(captureWindowsForegroundHwnd())
      if (hwnd) return hwnd
    }
    const raw = await getFrontmostBundleId()
    return asExternalBundleId(raw) ?? this.lastExternalBundleId
  }

  /** 按原显隐还原，不置顶、不抢焦（仅截屏前本应用就在前台时用） */
  private restoreWindowsAfterScreenshot(state: {
    clipboard: boolean
    panel: boolean
    settings: boolean
  }): void {
    if (state.panel) this.panel.show({ restoreOnly: true })
    if (state.clipboard) this.clipboard.showInactive()
    if (state.settings) this.settings.showInactive()
  }

  /** 截屏结束后把前台还给截屏前的外部应用 */
  async restoreExternalFocus(bundleId: string | null): Promise<void> {
    if (!bundleId) return
    if (process.platform === 'win32') {
      prepareWindowsFocusHandoff(bundleId)
    }
    await this.activateExternal(bundleId)
  }

  /**
   * 截屏收尾（对齐剪贴板：不改动被盖住的功能面板层级）：
   * - 截屏前已是外部应用在前台：关遮罩后还焦，自家窗保持隐藏（不 show，避免面板弹出来）
   * - 截屏前本应用就在前台：关遮罩后按原显隐 inactive 还原
   */
  async settleAfterScreenshot(opts: {
    hideOverlays: () => Promise<void>
    visibility: { clipboard: boolean; panel: boolean; settings: boolean } | null
    external: string | null
    restoreFocus: boolean
  }): Promise<void> {
    const external = opts.external
    const coveredByExternal = Boolean(external)

    if (coveredByExternal) {
      // 遮罩下若面板仍可见，先藏住；结束后也不再 show
      if (this.clipboard.isVisible()) this.clipboard.hide()
      if (this.panel.isVisible()) this.panel.hide()
      if (this.settings.isVisible()) this.settings.hide()
      if (opts.restoreFocus && process.platform === 'win32') {
        prepareWindowsFocusHandoff(external!)
      }
    }

    await opts.hideOverlays()

    if (opts.restoreFocus && external) {
      await this.activateExternal(external)
    }

    // 被其它软件盖着时不要还原窗口，否则会「弹出来」
    if (coveredByExternal) return

    const restore = opts.visibility
    if (restore && (restore.clipboard || restore.panel || restore.settings)) {
      this.restoreWindowsAfterScreenshot(restore)
    }
  }

  hideSettings(): void {
    this.settings.hide()
  }

  /**
   * 粘贴前恢复焦点：
   * - 独立浮层：回填呼出前的外部应用；不改动功能面板显隐与层级
   * - 浮层在本应用内呼出（未采到外部）：回焦面板
   * - 仅面板内剪贴板：关面板，激活呼出前 / 最近外部应用
   */
  async restorePreviousFocus(): Promise<boolean> {
    const floatingOpen = this.clipboard.isVisible()

    if (floatingOpen) {
      const external = asExternalBundleId(this.clipboard.takePreviousAppBundleId())

      if (process.platform === 'win32' && external) {
        prepareWindowsFocusHandoff(external)
      }

      this.clipboard.hide()

      if (external) {
        return this.activateExternal(external)
      }

      // 未采到外部（在本应用内呼出）：贴回面板
      if (this.panel.isVisible()) {
        this.panel.takePreviousAppBundleId()
        this.focusPanel()
        await delay(RESTORE_FOCUS_DELAY_MS)
        return true
      }

      await delay(RESTORE_FOCUS_DELAY_MS)
      return true
    }

    const bundleId = asExternalBundleId(
      this.panel.takePreviousAppBundleId() ?? this.lastExternalBundleId
    )

    if (process.platform === 'win32' && bundleId) {
      prepareWindowsFocusHandoff(bundleId)
    }

    this.hideAllOverlays()
    return this.activateExternal(bundleId)
  }

  /** 激活外部目标并等待焦点稳定；无目标时按平台尽量还焦 */
  private async activateExternal(bundleId: string | null): Promise<boolean> {
    if (process.platform === 'darwin') {
      if (!bundleId) return false
      const ok = await activateFocusTarget(bundleId)
      if (!ok) return false
      await delay(RESTORE_FOCUS_DELAY_MS)
      return true
    }

    if (process.platform === 'win32') {
      if (bundleId) {
        await delay(50)
        await activateFocusTarget(bundleId)
        await delay(RESTORE_FOCUS_DELAY_MS)
        if (isWindowsForegroundOurs() || !isWindowsForegroundTarget(bundleId)) {
          await activateFocusTarget(bundleId)
          await delay(120)
        }
      } else {
        await delay(RESTORE_FOCUS_DELAY_MS + 80)
      }
      return !isWindowsForegroundOurs()
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
