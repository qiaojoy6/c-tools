import { execFile, execFileSync } from 'child_process'
import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import type { AppConfig } from '@shared/types'
import { delay, loadRoute } from './loadRoute'

const RESTORE_FOCUS_DELAY_MS = 100

/** 浮层窗口可切换的路由：独立剪贴板 / 带左侧模块轨的面板 */
export type PanelRoute = '/clipboard' | '/panel'

/**
 * 主浮层窗口（无边框、置顶、失焦隐藏）
 * 同一窗口按路由切换：快捷键 → /clipboard；托盘面板 → /panel
 */
export class PanelWindow {
  private win: BrowserWindow | null = null
  private previousAppBundleId: string | null = null
  private currentRoute: PanelRoute = '/clipboard'

  constructor(
    private getConfig: () => AppConfig,
    private isQuitting: () => boolean
  ) {}

  get browserWindow(): BrowserWindow | null {
    return this.win
  }

  get route(): PanelRoute {
    return this.currentRoute
  }

  isVisible(): boolean {
    return this.win?.isVisible() ?? false
  }

  create(): BrowserWindow {
    const cfg = this.getConfig().window
    const win = new BrowserWindow({
      width: cfg.width,
      height: cfg.height,
      minWidth: cfg.minWidth,
      minHeight: cfg.minHeight,
      show: false,
      frame: cfg.frame,
      transparent: cfg.transparent,
      alwaysOnTop: cfg.alwaysOnTop,
      skipTaskbar: cfg.skipTaskbar,
      resizable: cfg.resizable,
      fullscreenable: false,
      maximizable: false,
      hasShadow: true,
      autoHideMenuBar: true,
      backgroundColor: cfg.transparent ? '#00000000' : undefined,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    this.position(win)

    win.on('blur', () => this.hide())
    win.on('close', (e) => {
      if (!this.isQuitting()) {
        e.preventDefault()
        win.hide()
      }
    })

    // 预创建默认进入独立剪贴板（快捷键主路径）
    this.currentRoute = '/clipboard'
    loadRoute(win, '/clipboard')
    this.win = win
    return win
  }

  /** 显示浮层；必要时经 IPC 切换路由（避免整页 reload） */
  show(route: PanelRoute = '/clipboard'): void {
    const win = this.win ?? this.create()
    this.capturePreviousFocusTarget()
    this.position(win)

    const routeChanged = this.currentRoute !== route
    if (routeChanged) {
      this.currentRoute = route
      if (!win.webContents.isLoading()) {
        win.webContents.send('route:navigate', route)
      } else {
        // 首次加载尚未完成时改用 loadRoute，避免 navigate 丢失
        loadRoute(win, route)
      }
    }

    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    if (process.platform === 'darwin') {
      app.focus({ steal: true })
    }
    // 同路由再显示：通知已挂载页重置；切路由时目标页 remount 会自行拉数
    if (!routeChanged) {
      win.webContents.send('panel:shown')
    }
  }

  hide(): void {
    if (this.win?.isVisible()) this.win.hide()
  }

  /** 切换独立剪贴板窗口 */
  toggleClipboard(): void {
    if (this.isVisible() && this.currentRoute === '/clipboard') this.hide()
    else this.show('/clipboard')
  }

  /** 切换带左侧模块轨的功能面板 */
  togglePanel(): void {
    if (this.isVisible() && this.currentRoute === '/panel') this.hide()
    else this.show('/panel')
  }

  /** 隐藏面板并恢复呼出前的前台应用（macOS） */
  async restorePreviousFocus(): Promise<boolean> {
    this.hide()

    if (process.platform !== 'darwin') {
      return true
    }

    const bundleId = this.previousAppBundleId
    this.previousAppBundleId = null
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

  private position(win: BrowserWindow): void {
    const cfg = this.getConfig().window
    const { workArea } = screen.getPrimaryDisplay()
    const [w] = win.getSize()
    const x = workArea.x + Math.round((workArea.width - w) / 2)
    const y = workArea.y + cfg.topOffset
    win.setPosition(x, y, false)
  }

  private capturePreviousFocusTarget(): void {
    if (process.platform !== 'darwin') {
      this.previousAppBundleId = null
      return
    }

    try {
      const bundleId = execFileSync(
        'osascript',
        [
          '-e',
          'tell application "System Events" to get bundle identifier of first application process whose frontmost is true'
        ],
        { encoding: 'utf8' }
      ).trim()

      if (!bundleId) return
      this.previousAppBundleId = bundleId
    } catch {
      this.previousAppBundleId = null
    }
  }
}
