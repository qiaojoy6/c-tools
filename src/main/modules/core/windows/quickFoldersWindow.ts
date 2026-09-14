import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import type { AppConfig } from '@shared/types'
import { loadRoute } from './loadRoute'
import { applyOverlayFloatingLevel } from './floatingLevel'

/**
 * 快捷文件夹浮层：无边框、置顶、失焦隐藏；由全局快捷键呼出。
 * 行为对齐 ClipboardWindow（macOS type:panel，不抬起功能面板）。
 */
export class QuickFoldersWindow {
  private win: BrowserWindow | null = null
  /** >0 时忽略 blur 隐藏（系统选目录对话框会抢焦点） */
  private suppressBlurHide = 0

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

  beginSuppressBlurHide(): void {
    this.suppressBlurHide += 1
  }

  endSuppressBlurHide(): void {
    this.suppressBlurHide = Math.max(0, this.suppressBlurHide - 1)
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
      if (this.suppressBlurHide > 0) return
      if (this.getConfig().window.hideOnBlur) this.hide()
    })

    win.on('close', (e) => {
      if (!this.isQuitting()) {
        e.preventDefault()
        this.hide()
      }
    })

    loadRoute(win, '/quick-folders')
    this.win = win
    return win
  }

  show(): void {
    const win = this.win ?? this.create()
    if (win.isDestroyed()) return

    this.position(win)
    if (win.isMinimized()) win.restore()
    this.applyFloatingLevel(win)

    win.show()
    win.focus()
    win.webContents.send('panel:shown')
  }

  hide(): void {
    if (!this.win?.isVisible()) return
    if (this.win.isFocused()) this.win.blur()
    if (process.platform === 'win32') {
      this.win.setAlwaysOnTop(false)
      this.win.setFocusable(false)
      this.win.hide()
      this.win.setFocusable(true)
      return
    }
    this.win.hide()
  }

  private applyFloatingLevel(win: BrowserWindow): void {
    applyOverlayFloatingLevel(win, this.getConfig().window.alwaysOnTop)
  }

  /** 居中贴在鼠标所在显示器顶部 */
  private position(win: BrowserWindow): void {
    const cfg = this.getConfig().window
    const cursor = screen.getCursorScreenPoint()
    const { workArea } = screen.getDisplayNearestPoint(cursor)
    const [w] = win.getSize()
    const x = workArea.x + Math.round((workArea.width - w) / 2)
    const y = workArea.y + cfg.topOffset
    win.setPosition(x, y, false)
  }
}
