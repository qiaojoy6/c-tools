import type { AppConfig } from '@shared/types'
import { app } from 'electron'
import { delay } from './loadRoute'
import { ClipboardWindow } from './clipboardWindow'
import { PanelWindow, type PanelShowOptions } from './panelWindow'
import { SettingsWindow } from './settingsWindow'
import {
  activateExternalApp,
  captureFrontmostRaw,
  prepareYieldFocus,
  yieldFocusToExternal
} from './focusHandoff'
import {
  asExternalBundleId,
  captureWindowsForegroundHwnd
} from './focusTarget'

const RESTORE_FOCUS_DELAY_MS = process.platform === 'win32' ? 220 : 120

export type AppWindowVisibility = {
  clipboard: boolean
  panel: boolean
  settings: boolean
}

/**
 * 窗口枢纽：独立剪贴板浮层 + 功能面板 + 设置窗
 * 还焦原语见 focusHandoff（粘贴 / 截屏共用）
 */
export class WindowManager {
  private quitting = false
  /** 最近一次外部前台应用，面板内粘贴 / 截屏被盖住时的回落目标 */
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

  /** 藏起剪贴板 / 面板 / 设置（截屏遮罩下或还焦前） */
  hideAppBrowserWindows(): void {
    if (this.clipboard.isVisible()) this.clipboard.hide()
    if (this.panel.isVisible()) this.panel.hide()
    if (this.settings.isVisible()) this.settings.hide()
  }

  /** 记下显隐后藏起剪贴板 / 面板 / 设置（截屏 hideAppWindows） */
  captureAndHideAppWindows(): AppWindowVisibility {
    const state: AppWindowVisibility = {
      clipboard: this.clipboard.isVisible(),
      panel: this.panel.isVisible(),
      settings: this.settings.isVisible()
    }
    this.hideAppBrowserWindows()
    return state
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

  hideSettings(): void {
    this.settings.hide()
  }

  /**
   * 截屏开始前采外部前台。
   * - 当前前台是外部应用 → 用之
   * - 当前前台是本应用 → null（截完应正常还原）
   * - 采集失败且面板可见未聚焦 → 回落 lastExternal（被盖住）
   */
  async captureScreenshotExternalFocus(): Promise<string | null> {
    const raw = await captureFrontmostRaw()
    const external = asExternalBundleId(raw)
    if (external) return external
    // raw 有值说明前台是本应用，不能用陈旧 lastExternal 误判成「被盖住」
    if (raw) return null

    const panelWin = this.panel.browserWindow
    const panelCovered =
      this.panel.isVisible() && !!panelWin && !panelWin.isDestroyed() && !panelWin.isFocused()
    if (panelCovered) return this.lastExternalBundleId
    return null
  }

  /**
   * 截屏收尾（与粘贴还焦同一套 prepare → hide → activate）：
   * - 被外部盖住：关遮罩后还焦，自家窗保持隐藏（不 show）
   * - 本应用前台：关遮罩后按原显隐正常 show
   */
  async settleAfterScreenshot(opts: {
    hideOverlays: () => Promise<void>
    visibility: AppWindowVisibility | null
    external: string | null
    restoreFocus: boolean
  }): Promise<void> {
    const { external, restoreFocus, visibility } = opts
    const coveredByExternal = Boolean(external)

    if (coveredByExternal) {
      this.hideAppBrowserWindows()
      if (restoreFocus) prepareYieldFocus(external)
    }

    await opts.hideOverlays()

    if (restoreFocus && external) {
      await activateExternalApp(external)
    }

    if (coveredByExternal) return

    if (!visibility) return
    if (visibility.panel) this.showPanel({ captureFocus: false })
    if (visibility.clipboard) this.showClipboard()
    if (visibility.settings) this.showSettings()
  }

  /** 另存为等：无中间 hide 的一站式还焦 */
  restoreExternalFocus(bundleId: string | null): Promise<boolean> {
    return yieldFocusToExternal(bundleId)
  }

  /**
   * 粘贴前恢复焦点（与截屏 settle 共用 focusHandoff）：
   * - 独立浮层：回填呼出前的外部应用；不改动功能面板显隐与层级
   * - 浮层在本应用内呼出（未采到外部）：回焦面板
   * - 仅面板内剪贴板：关面板，激活呼出前 / 最近外部应用
   */
  async restorePreviousFocus(): Promise<boolean> {
    const floatingOpen = this.clipboard.isVisible()

    if (floatingOpen) {
      const external = asExternalBundleId(this.clipboard.takePreviousAppBundleId())

      // prepare → hide → activate（与截屏被盖住时一致）
      prepareYieldFocus(external)
      this.clipboard.hide()

      if (external) {
        return activateExternalApp(external)
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

    prepareYieldFocus(bundleId)
    this.hideAllOverlays()
    return activateExternalApp(bundleId)
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
