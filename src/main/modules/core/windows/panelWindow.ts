import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import type { AppConfig } from '@shared/types'
import { resolveIsDark } from '../theme'
import { loadRoute } from './loadRoute'
import {
  asExternalBundleId,
  getFrontmostBundleId
} from './focusTarget'

/** 功能面板通栏高度，与渲染侧表头、titleBarOverlay 一致 */
export const PANEL_TITLE_BAR_HEIGHT = 40

/** Windows / Linux 原生窗控覆盖层：浅 / 深随主题 */
export const PANEL_TITLE_BAR_OVERLAY_LIGHT = {
  color: '#eef0f3',
  symbolColor: '#52525b',
  height: PANEL_TITLE_BAR_HEIGHT
} as const

export const PANEL_TITLE_BAR_OVERLAY_DARK = {
  color: '#2a2e38',
  symbolColor: '#c4c4cc',
  height: PANEL_TITLE_BAR_HEIGHT
} as const

export interface PanelShowOptions {
  /** 显示前是否采焦（默认 true；异步短超时，不卡死主进程） */
  captureFocus?: boolean
  /** 仅恢复可见：不置顶、不抢焦（截屏结束后还原） */
  restoreOnly?: boolean
}

/**
 * 功能面板窗口：titleBarStyle hidden + 原生窗控，顶部自定义通栏
 * 托盘左键 / 程序坞：已打开则置顶、不关闭；托盘右键可切换显隐；ESC / 失焦不关闭
 */
export class PanelWindow {
  private win: BrowserWindow | null = null
  private previousAppBundleId: string | null = null
  private blurTimer: ReturnType<typeof setTimeout> | null = null

  /** 采到外部前台应用时回调（供 WindowManager 记 lastExternal） */
  onExternalAppCaptured: ((bundleId: string) => void) | null = null

  constructor(
    private isQuitting: () => boolean,
    private getTheme: () => AppConfig['general']['theme']
  ) {}

  get browserWindow(): BrowserWindow | null {
    return this.win
  }

  isVisible(): boolean {
    return this.win?.isVisible() ?? false
  }

  /** Win/Linux：按主题刷新原生窗控底色 */
  applyChromeTheme(): void {
    if (process.platform === 'darwin') return
    const win = this.win
    if (!win || win.isDestroyed()) return
    const overlay = resolveIsDark(this.getTheme())
      ? PANEL_TITLE_BAR_OVERLAY_DARK
      : PANEL_TITLE_BAR_OVERLAY_LIGHT
    win.setTitleBarOverlay({ ...overlay })
  }

  create(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win

    const overlay = resolveIsDark(this.getTheme())
      ? PANEL_TITLE_BAR_OVERLAY_DARK
      : PANEL_TITLE_BAR_OVERLAY_LIGHT

    const win = new BrowserWindow({
      width: 880,
      height: 600,
      minWidth: 720,
      minHeight: 480,
      show: false,
      title: '功能面板',
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: 14, y: 12 },
      ...(process.platform !== 'darwin'
        ? {
            titleBarOverlay: { ...overlay }
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

    // 失焦后记下切到的外部应用，供面板内剪贴板粘贴还原
    win.on('blur', () => {
      if (this.blurTimer) clearTimeout(this.blurTimer)
      this.blurTimer = setTimeout(() => {
        void this.rememberFrontmostExternal()
      }, 120)
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

    // 截屏还原：只恢复可见，不把面板抬到其它应用之上
    if (opts?.restoreOnly) {
      if (win.isMinimized()) win.restore()
      if (!win.isVisible()) win.showInactive()
      return
    }

    // 默认采焦：异步短超时，保证面板内粘贴能回到外部应用
    if (opts?.captureFocus !== false) {
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
    if (!this.win?.isVisible()) return
    // Windows：粘贴还焦时同样用 setFocusable(false) 把焦点让出去
    if (process.platform === 'win32') {
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

  private async rememberFrontmostExternal(): Promise<void> {
    const raw = await getFrontmostBundleId()
    const external = asExternalBundleId(raw)
    if (!external) return
    this.previousAppBundleId = external
    this.onExternalAppCaptured?.(external)
  }

  private async capturePreviousFocusTargetAsync(): Promise<void> {
    const raw = await getFrontmostBundleId()
    const external = asExternalBundleId(raw)
    if (external) {
      this.previousAppBundleId = external
      this.onExternalAppCaptured?.(external)
    }
    // 若采到自己或失败：保留已有 previousAppBundleId（如上次 blur 记下的）
  }
}
