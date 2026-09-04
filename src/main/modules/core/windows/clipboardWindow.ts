import { execFile, execFileSync } from 'child_process'
import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import type { AppConfig } from '@shared/types'
import { delay, loadRoute } from './loadRoute'

const RESTORE_FOCUS_DELAY_MS = 100

/**
 * 独立剪贴板浮层：无边框、置顶、失焦隐藏；由全局快捷键呼出
 */
export class ClipboardWindow {
  private win: BrowserWindow | null = null
  private previousAppBundleId: string | null = null

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
      backgroundColor: cfg.transparent ? '#00000000' : undefined,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    this.position(win)

    win.on('blur', () => {
      if (this.getConfig().window.hideOnBlur) this.hide()
    })

    win.on('close', (e) => {
      if (!this.isQuitting()) {
        e.preventDefault()
        win.hide()
      }
    })

    loadRoute(win, '/clipboard')
    this.win = win
    return win
  }

  show(): void {
    const win = this.win ?? this.create()
    this.capturePreviousFocusTarget()
    this.position(win)
    if (win.isMinimized()) win.restore()
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

  /** 隐藏并恢复呼出前的前台应用（macOS） */
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
