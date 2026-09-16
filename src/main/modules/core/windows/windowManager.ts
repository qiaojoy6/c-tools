import type { AppConfig } from '@shared/types'
import { app } from 'electron'
import {
  beginAppUiConceal,
  endAppUiConceal,
  type AppUiConcealHost,
  type AppUiConcealSession,
  type AppUiConcealStrategy
} from './appUiConceal'
import { delay } from './loadRoute'
import {
  bindDockIconToPanel,
  holdMacDockDuringShot,
  reassertMacDockHiddenIfNeeded
} from './macDockIcon'
import { ClipboardWindow } from './clipboardWindow'
import { PanelWindow, type PanelShowOptions } from './panelWindow'
import { QuickFoldersWindow } from './quickFoldersWindow'
import { SettingsWindow } from './settingsWindow'
import {
  activateExternalApp,
  captureFrontmostRaw,
  prepareYieldFocus,
  RESTORE_FOCUS_DELAY_MS
} from './focusHandoff'
import { asExternalBundleId, captureWindowsForegroundHwnd } from './focusTarget'

export type { AppUiConcealSession, AppUiConcealStrategy } from './appUiConceal'

/**
 * 窗口枢纽：独立剪贴板 / 快捷文件夹浮层 + 功能面板 + 设置窗
 * 还焦原语见 focusHandoff（粘贴 / 截屏共用）
 */
export class WindowManager {
  private quitting = false
  /** 最近一次外部前台应用，面板内粘贴 / 截屏被盖住时的回落目标 */
  private lastExternalBundleId: string | null = null
  /** 截屏还原「面板在下面」后，抑制 activate → showPanel 抬起 */
  private suppressPanelRaiseUntil = 0
  readonly clipboard: ClipboardWindow
  readonly quickFolders: QuickFoldersWindow
  readonly panel: PanelWindow
  readonly settings: SettingsWindow

  constructor(getConfig: () => AppConfig) {
    const isQuitting = (): boolean => this.quitting
    this.clipboard = new ClipboardWindow(getConfig, isQuitting)
    this.quickFolders = new QuickFoldersWindow(getConfig, isQuitting)
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

  get quickFoldersWindow() {
    return this.quickFolders.browserWindow
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
    return this.clipboard.isVisible() || this.quickFolders.isVisible() || this.panel.isVisible()
  }

  /** 预创建浮层 + 功能面板（隐藏），避免首次点程序坞再冷创建 */
  createPanel(): void {
    this.clipboard.create()
    this.quickFolders.create()
    this.panel.create()
    // macOS：默认不进程序坞；唤起面板后展示；最小化仍保留
    bindDockIconToPanel(() => this.panel.shouldShowDockIcon())
  }

  /**
   * 快捷键呼出独立剪贴板。
   * 不改功能面板显隐/层级（macOS 用 showInactive，不调 app.focus）。
   */
  showClipboard(): void {
    this.clipboard.show()
  }

  showQuickFolders(): void {
    this.quickFolders.show()
  }

  showPanel(opts?: PanelShowOptions): void {
    this.panel.show(opts)
  }

  /** 截屏收尾：面板应留在其它软件下面时，短暂忽略 activate 抬窗 */
  private suppressPanelRaise(ms = 2500): void {
    this.suppressPanelRaiseUntil = Date.now() + ms
  }

  /** macOS activate 是否应跳过 showPanel（避免还原后被抬到最前） */
  shouldSuppressPanelRaise(): boolean {
    return Date.now() < this.suppressPanelRaiseUntil
  }

  hideClipboard(): void {
    this.clipboard.hide()
  }

  hideQuickFolders(): void {
    this.quickFolders.hide()
  }

  /** IPC `panel:hide`：关独立浮层（剪贴板 / 快捷文件夹；功能面板不关） */
  hidePanel(): void {
    this.hideClipboard()
    this.hideQuickFolders()
  }

  hideAllOverlays(): void {
    this.clipboard.hide()
    this.quickFolders.hide()
    this.panel.hide()
  }

  private concealHost(): AppUiConcealHost {
    return {
      isPanelVisible: () => this.panel.isVisible(),
      setPanelDimmed: (dimmed) => this.panel.setShotDimmed(dimmed)
    }
  }

  /**
   * 按策略开始隐身，并冻结 Dock（进入瞬间状态）。
   * 截屏用 `screenshotConcealStrategy(hide)`；录制用 `recorderConcealStrategy()`（none）。
   */
  beginAppUiConceal(strategy: AppUiConcealStrategy): AppUiConcealSession {
    // 先冻结 Dock，再改透明度，避免策略切换时闪一下
    holdMacDockDuringShot(true)
    return beginAppUiConceal(strategy, this.concealHost())
  }

  /** 结束隐身并解冻 Dock */
  endAppUiConceal(session: AppUiConcealSession): void {
    endAppUiConceal(session, this.concealHost())
    holdMacDockDuringShot(false)
  }

  toggleClipboard(): void {
    if (this.clipboard.isVisible()) this.hideClipboard()
    else this.showClipboard()
  }

  toggleQuickFolders(): void {
    if (this.quickFolders.isVisible()) this.hideQuickFolders()
    else this.showQuickFolders()
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
   * 截屏开始前采外部前台。
   * - 当前前台是外部应用 → 用之
   * - 面板可见但未聚焦 → 视为在下面（即使用 lastExternal；兼容快捷键已抬起本应用）
   * - 当前前台是本应用且面板有焦点 → null（截完应正常还原）
   */
  async captureScreenshotExternalFocus(): Promise<string | null> {
    const raw = await captureFrontmostRaw()
    const external = asExternalBundleId(raw)
    if (external) return external

    const panelWin = this.panel.browserWindow
    const panelVisible =
      this.panel.isVisible() && !!panelWin && !panelWin.isDestroyed()
    // 面板在下面：未聚焦，或采集失败；用 blur 记下的外部应用
    if (panelVisible && !panelWin!.isFocused() && this.lastExternalBundleId) {
      return this.lastExternalBundleId
    }
    if (raw) return null
    if (panelVisible && this.lastExternalBundleId) return this.lastExternalBundleId
    return null
  }

  /**
   * 截屏 / 框选收尾：关遮罩 → 还原 conceal → 可选还焦外部。
   * 不 show 面板（dim 路径窗口一直在，避免抬到最前）。
   */
  async settleAfterCapture(opts: {
    hideOverlays: () => Promise<void>
    conceal: AppUiConcealSession | null
    external: string | null
    restoreFocus: boolean
  }): Promise<void> {
    const { external, restoreFocus, conceal } = opts

    if (external) {
      this.suppressPanelRaise(2500)
      if (restoreFocus) prepareYieldFocus(external)
    }

    await opts.hideOverlays()

    if (restoreFocus && external) await activateExternalApp(external)

    if (conceal) {
      this.endAppUiConceal(conceal)
    } else {
      holdMacDockDuringShot(false)
      reassertMacDockHiddenIfNeeded()
    }

    if (restoreFocus && external) await activateExternalApp(external)
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
