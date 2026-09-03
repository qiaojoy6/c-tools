import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import type { AppConfig } from '../../../shared/types'

/**
 * 窗口管理：面板窗口创建完全由 WindowConfig 驱动
 */
export class WindowManager {
  private panel: BrowserWindow | null = null
  private quitting = false

  constructor(private getConfig: () => AppConfig) {}

  markQuitting(): void {
    this.quitting = true
  }

  get panelWindow(): BrowserWindow | null {
    return this.panel
  }

  isVisible(): boolean {
    return this.panel?.isVisible() ?? false
  }

  /** 创建面板窗口（配置化创建） */
  createPanel(): BrowserWindow {
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

    this.positionPanel(win)

    win.on('blur', () => this.hidePanel())
    win.on('close', (e) => {
      if (!this.quitting) {
        e.preventDefault()
        win.hide()
      }
    })

    if (process.env['ELECTRON_RENDERER_URL']) {
      win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      win.loadFile(join(__dirname, '../renderer/index.html'))
    }

    this.panel = win
    return win
  }

  showPanel(): void {
    const win = this.panel ?? this.createPanel()
    this.positionPanel(win)
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    if (process.platform === 'darwin') {
      app.focus({ steal: true })
    }
    win.webContents.send('panel:shown')
  }

  hidePanel(): void {
    if (this.panel?.isVisible()) this.panel.hide()
  }

  togglePanel(): void {
    if (this.isVisible()) {
      this.hidePanel()
    } else {
      this.showPanel()
    }
  }

  /** 面板定位：工作区顶部居中（Spotlight 风格） */
  private positionPanel(win: BrowserWindow): void {
    const cfg = this.getConfig().window
    const { workArea } = screen.getPrimaryDisplay()
    const [w] = win.getSize()
    const x = workArea.x + Math.round((workArea.width - w) / 2)
    const y = workArea.y + cfg.topOffset
    win.setPosition(x, y, false)
  }
}
