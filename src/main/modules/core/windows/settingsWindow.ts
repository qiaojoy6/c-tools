import { BrowserWindow } from 'electron'
import { join } from 'path'
import { loadRoute } from './loadRoute'

const SETTINGS_WINDOW = {
  width: 720,
  height: 560,
  minWidth: 640,
  minHeight: 480
} as const

/**
 * 设置窗口：普通带边框，可承载多模块设置页
 */
export class SettingsWindow {
  private win: BrowserWindow | null = null

  /** 关闭/隐藏时回调（如恢复全局快捷键） */
  onClosed: (() => void) | null = null

  constructor(private isQuitting: () => boolean) {}

  get browserWindow(): BrowserWindow | null {
    return this.win
  }

  create(): BrowserWindow {
    const win = new BrowserWindow({
      width: SETTINGS_WINDOW.width,
      height: SETTINGS_WINDOW.height,
      minWidth: SETTINGS_WINDOW.minWidth,
      minHeight: SETTINGS_WINDOW.minHeight,
      show: false,
      frame: true,
      transparent: false,
      alwaysOnTop: false,
      skipTaskbar: false,
      resizable: true,
      fullscreenable: false,
      maximizable: false,
      title: '设置',
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    win.on('close', (e) => {
      if (!this.isQuitting()) {
        e.preventDefault()
        win.hide()
        this.onClosed?.()
      }
    })

    loadRoute(win, '/settings')
    this.win = win
    return win
  }

  show(): void {
    const win = this.win ?? this.create()
    if (win.isMinimized()) win.restore()
    win.center()
    win.show()
    win.focus()
    win.webContents.send('settings:shown')
  }

  hide(): void {
    if (this.win?.isVisible()) {
      this.win.hide()
      this.onClosed?.()
    }
  }
}
