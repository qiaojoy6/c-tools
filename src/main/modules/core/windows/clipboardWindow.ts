import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import type { AppConfig } from '@shared/types'
import { loadRoute } from './loadRoute'
import { asExternalBundleId, getFrontmostBundleId } from './focusTarget'

/**
 * 独立剪贴板浮层：无边框、置顶、失焦隐藏；由全局快捷键呼出。
 * macOS 使用 type: 'panel'，show/focus 不激活整个应用，避免把功能面板一并抬到前台。
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
      // macOS：panel 窗 show/focus 不激活应用，其它窗口层级保持不动
      ...(process.platform === 'darwin' ? { type: 'panel' as const } : {}),
      backgroundColor: cfg.transparent ? '#00000000' : undefined,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    this.applyFloatingLevel(win)
    this.position(win)

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

    this.position(win)
    if (win.isMinimized()) win.restore()
    this.applyFloatingLevel(win)

    // 不调用 app.focus，避免抬起功能面板（macOS 另靠 type:panel）
    win.show()
    win.focus()
    win.webContents.send('panel:shown')
  }

  hide(): void {
    if (!this.win?.isVisible()) return
    // 先 blur，避免隐藏后仍被当成应用「上次焦点窗」，导致 Cmd+Tab 切回无界面
    if (this.win.isFocused()) this.win.blur()
    // Windows：先取消置顶，再 setFocusable(false) 强迫系统把焦点还给上一窗口
    if (process.platform === 'win32') {
      this.win.setAlwaysOnTop(false)
      this.win.setFocusable(false)
      this.win.hide()
      this.win.setFocusable(true)
      return
    }
    this.win.hide()
  }

  takePreviousAppBundleId(): string | null {
    const id = this.previousAppBundleId
    this.previousAppBundleId = null
    return id
  }

  /** Windows：快捷键瞬间写入外部目标，避免 show 异步采焦丢失 */
  seedPreviousAppBundleId(bundleId: string): void {
    if (!bundleId || asExternalBundleId(bundleId) == null) return
    this.previousAppBundleId = bundleId
    this.onExternalAppCaptured?.(bundleId)
  }

  /** 高置顶层级，浮在其它应用之上且不依赖激活本应用 */
  private applyFloatingLevel(win: BrowserWindow): void {
    const onTop = this.getConfig().window.alwaysOnTop
    if (!onTop) {
      win.setAlwaysOnTop(false)
      return
    }
    if (process.platform === 'darwin') {
      // screen-saver 级置顶即可；不用 visibleOnAllWorkspaces（会扰乱 Spaces / Cmd+Tab）
      win.setAlwaysOnTop(true, 'screen-saver')
      return
    }
    win.setAlwaysOnTop(true)
  }

  /** 居中贴在鼠标所在显示器顶部（多屏时不再固定主屏） */
  private position(win: BrowserWindow): void {
    const cfg = this.getConfig().window
    const cursor = screen.getCursorScreenPoint()
    const { workArea } = screen.getDisplayNearestPoint(cursor)
    const [w] = win.getSize()
    const x = workArea.x + Math.round((workArea.width - w) / 2)
    const y = workArea.y + cfg.topOffset
    win.setPosition(x, y, false)
  }

  private async capturePreviousFocusTargetAsync(): Promise<void> {
    const raw = await getFrontmostBundleId()
    const external = asExternalBundleId(raw)
    if (external) {
      this.previousAppBundleId = external
      this.onExternalAppCaptured?.(external)
    }
  }
}
