import { execFile } from 'child_process'
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { delay, loadRoute } from './loadRoute'

const RESTORE_FOCUS_DELAY_MS = 100

/** 功能面板通栏高度，与渲染侧表头、titleBarOverlay 一致 */
export const PANEL_TITLE_BAR_HEIGHT = 40

/** Windows / Linux 原生窗控覆盖层（与暗色面板表头接近） */
export const PANEL_TITLE_BAR_OVERLAY = {
  color: '#1c1f26',
  symbolColor: '#c8c8c8',
  height: PANEL_TITLE_BAR_HEIGHT
} as const

export interface PanelShowOptions {
  /**
   * 是否在显示前记录前台应用（粘贴后还原用）。
   * 程序坞 / 二次启动应关：同步 osascript 会卡住主进程，导致要点好几下才出来。
   */
  captureFocus?: boolean
}

/**
 * 功能面板窗口：titleBarStyle hidden + 原生窗控，顶部自定义通栏
 * 托盘 / 程序坞呼出；ESC / 失焦不关闭
 */
export class PanelWindow {
  private win: BrowserWindow | null = null
  private previousAppBundleId: string | null = null

  constructor(private isQuitting: () => boolean) {}

  get browserWindow(): BrowserWindow | null {
    return this.win
  }

  isVisible(): boolean {
    return this.win?.isVisible() ?? false
  }

  create(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win

    const win = new BrowserWindow({
      width: 880,
      height: 600,
      minWidth: 720,
      minHeight: 480,
      show: false,
      title: '功能面板',
      // 隐藏系统标题栏，保留原生最小化 / 最大化 / 关闭
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: 14, y: 12 },
      ...(process.platform !== 'darwin'
        ? {
            titleBarOverlay: { ...PANEL_TITLE_BAR_OVERLAY }
          }
        : {}),
      transparent: false,
      alwaysOnTop: false,
      skipTaskbar: false,
      resizable: true,
      fullscreenable: false,
      maximizable: true,
      hasShadow: true,
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        // 项目模块用 <webview> 预览本地静态页
        webviewTag: true
      }
    })

    win.center()

    win.on('close', (e) => {
      if (!this.isQuitting()) {
        e.preventDefault()
        win.hide()
      }
    })

    loadRoute(win, '/panel')
    this.win = win
    return win
  }

  show(opts?: PanelShowOptions): void {
    void this.showAsync(opts)
  }

  private async showAsync(opts?: PanelShowOptions): Promise<void> {
    const win = this.win ?? this.create()
    if (win.isDestroyed()) return

    // 程序坞唤起不采焦：避免等 osascript 导致「要点好几下」
    if (opts?.captureFocus === false) {
      this.previousAppBundleId = null
    } else {
      await this.capturePreviousFocusTargetAsync()
      if (win.isDestroyed()) return
    }

    if (win.isMinimized()) win.restore()
    if (!win.isVisible()) win.center()
    win.show()
    win.moveTop()
    win.focus()
    if (process.platform === 'darwin') {
      app.focus({ steal: true })
    }
    win.webContents.send('panel:shown')
  }

  hide(): void {
    if (this.win?.isVisible()) this.win.hide()
  }

  toggle(): void {
    if (this.isVisible()) this.hide()
    else this.show()
  }

  /** 隐藏并恢复呼出前的前台应用（macOS）；面板内剪贴板粘贴时使用 */
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

  takePreviousAppBundleId(): string | null {
    const id = this.previousAppBundleId
    this.previousAppBundleId = null
    return id
  }

  /** 异步读取前台 app，不阻塞主进程事件循环 */
  private capturePreviousFocusTargetAsync(): Promise<void> {
    if (process.platform !== 'darwin') {
      this.previousAppBundleId = null
      return Promise.resolve()
    }

    return new Promise((resolve) => {
      execFile(
        'osascript',
        [
          '-e',
          'tell application "System Events" to get bundle identifier of first application process whose frontmost is true'
        ],
        { encoding: 'utf8', timeout: 800 },
        (err, stdout) => {
          if (err) {
            this.previousAppBundleId = null
            resolve()
            return
          }
          const bundleId = stdout.trim()
          this.previousAppBundleId = bundleId || null
          resolve()
        }
      )
    })
  }
}
