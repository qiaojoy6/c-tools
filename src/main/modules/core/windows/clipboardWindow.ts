import { execFile } from 'child_process'
import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import type { AppConfig } from '@shared/types'
import { delay, loadRoute } from './loadRoute'
import { asExternalBundleId, getFrontmostBundleId } from './focusTarget'

const RESTORE_FOCUS_DELAY_MS = 100

/**
 * 独立剪贴板浮层：无边框、置顶、失焦隐藏；由全局快捷键呼出
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
    void this.showAsync()
  }

  private async showAsync(): Promise<void> {
    const win = this.win ?? this.create()
    if (win.isDestroyed()) return

    await this.capturePreviousFocusTargetAsync()
    if (win.isDestroyed()) return

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

    const bundleId = asExternalBundleId(this.previousAppBundleId)
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

  private async capturePreviousFocusTargetAsync(): Promise<void> {
    const raw = await getFrontmostBundleId()
    const external = asExternalBundleId(raw)
    if (external) {
      this.previousAppBundleId = external
      this.onExternalAppCaptured?.(external)
    }
  }
}
