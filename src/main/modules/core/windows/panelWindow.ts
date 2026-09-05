import { execFile, execFileSync } from 'child_process'
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

/**
 * 功能面板窗口：titleBarStyle hidden + 原生窗控，顶部自定义通栏
 * 托盘呼出；ESC / 失焦不关闭
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

  show(): void {
    const win = this.win ?? this.create()
    this.capturePreviousFocusTarget()
    if (win.isMinimized()) win.restore()
    if (!win.isVisible()) win.center()
    win.show()
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
