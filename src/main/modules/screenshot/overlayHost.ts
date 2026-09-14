import { join } from 'path'
import { BrowserWindow, ipcMain, screen } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { delay, loadRoute } from '../core/windows/loadRoute'
import { syncMacDockIcon } from '../core/windows/macDockIcon'
import type { ShotDisplayFrame, ShotOverlayInit, ShotRect, ShotWindowInfo } from '@shared/types'
import { shotImageUrl } from './protocol'
import { windowsOnDisplay } from './windowHit'

const execFileAsync = promisify(execFile)

/**
 * macOS：临时隐藏菜单栏+程序坞，使普通窗可以铺满 display.bounds。
 * HideDock(1<<1) | HideMenuBar(1<<2) = 6
 */
async function setMacChromeHidden(hidden: boolean): Promise<void> {
  if (process.platform !== 'darwin') return
  const opts = hidden ? 6 : 0
  try {
    await execFileAsync(
      'osascript',
      [
        '-l',
        'JavaScript',
        '-e',
        `ObjC.import('AppKit');$.NSApplication.sharedApplication.setPresentationOptions(${opts});`
      ],
      { timeout: 1500 }
    )
  } catch (err) {
    console.warn('[screenshot] setPresentationOptions failed:', err)
  }
}

/**
 * 每块屏一个置顶遮罩窗。
 * 关键：冻屏图在隐藏窗内画好 → 再藏系统栏 → 再 show，避免黑屏/闪一下。
 */
export class ScreenshotOverlayHost {
  private wins = new Map<number, BrowserWindow>()
  private ready = new Set<number>()
  private macChromeHidden = false
  private contentWaiters = new Map<
    number,
    { resolve: () => void; timer: ReturnType<typeof setTimeout> }
  >()

  constructor() {
    ipcMain.removeAllListeners('screenshot:overlay-ready')
    ipcMain.on('screenshot:overlay-ready', (_e, displayId: unknown) => {
      const id = Number(displayId)
      if (!Number.isFinite(id)) return
      this.resolveContentReady(id)
    })
  }

  /** 小窗加载路由即可；勿在预热阶段铺全屏/置顶，否则会抢焦点并弄没面板/设置 */
  prewarm(): void {
    for (const display of screen.getAllDisplays()) {
      this.ensureWindow(display.id, {
        x: display.bounds.x,
        y: display.bounds.y,
        width: 8,
        height: 8
      })
    }
  }

  /** 等路由加载完（预热） */
  async waitPageReady(displayId: number, timeoutMs = 8000): Promise<void> {
    const win = this.wins.get(displayId)
    if (!win || win.isDestroyed()) return
    if (this.ready.has(displayId) && !win.webContents.isLoading()) return
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, timeoutMs)
      win.webContents.once('did-finish-load', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }

  private ensureWindow(displayId: number, place: ShotRect): BrowserWindow {
    const existing = this.wins.get(displayId)
    if (existing && !existing.isDestroyed()) {
      if (!existing.isVisible()) existing.setBounds(place)
      return existing
    }

    // 预热阶段保持普通隐藏窗；置顶 / 全 Space 仅在 showSession 时施加
    const win = new BrowserWindow({
      x: place.x,
      y: place.y,
      width: place.width,
      height: place.height,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: false,
      focusable: false,
      hasShadow: false,
      show: false,
      paintWhenInitiallyHidden: true,
      backgroundColor: '#00000000',
      ...(process.platform === 'darwin' ? { roundedCorners: false } : {}),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        backgroundThrottling: false
      }
    })

    if (process.platform === 'darwin') {
      win.setWindowButtonVisibility(false)
    }

    win.webContents.on('did-finish-load', () => {
      this.ready.add(displayId)
    })

    win.on('closed', () => {
      this.wins.delete(displayId)
      this.ready.delete(displayId)
      this.resolveContentReady(displayId)
    })

    loadRoute(win, '/screenshot')
    this.wins.set(displayId, win)
    return win
  }

  private waitContentReady(displayId: number, timeoutMs = 2500): Promise<void> {
    return new Promise((resolve) => {
      const prev = this.contentWaiters.get(displayId)
      if (prev) {
        clearTimeout(prev.timer)
        prev.resolve()
      }
      const timer = setTimeout(() => {
        this.contentWaiters.delete(displayId)
        resolve()
      }, timeoutMs)
      this.contentWaiters.set(displayId, {
        resolve: () => {
          clearTimeout(timer)
          this.contentWaiters.delete(displayId)
          resolve()
        },
        timer
      })
    })
  }

  private resolveContentReady(displayId: number): void {
    const w = this.contentWaiters.get(displayId)
    if (!w) return
    w.resolve()
  }

  async showSession(
    sessionId: string,
    frames: ShotDisplayFrame[],
    allWindows: ShotWindowInfo[],
    windowPickAvailable: boolean
  ): Promise<void> {
    const activeIds = new Set(frames.map((f) => f.displayId))

    for (const [id, win] of this.wins) {
      if (!activeIds.has(id) && !win.isDestroyed() && win.isVisible()) {
        win.hide()
      }
    }

    // 1) 隐藏窗内先灌冻屏图，等渲染画完再露脸
    const boot: Promise<void>[] = []
    for (const frame of frames) {
      const place = { ...frame.bounds }
      const win = this.ensureWindow(frame.displayId, place)
      boot.push(
        (async () => {
          await this.waitPageReady(frame.displayId)
          if (win.isDestroyed()) return
          win.setBounds(place)
          const init: ShotOverlayInit = {
            sessionId,
            displayId: frame.displayId,
            bounds: frame.bounds,
            workArea: frame.workArea,
            viewportOffset: { x: 0, y: 0 },
            scaleFactor: frame.scaleFactor,
            imageUrl: shotImageUrl(frame.imagePath),
            windows: windowsOnDisplay(allWindows, frame.bounds),
            windowPickAvailable
          }
          const ready = this.waitContentReady(frame.displayId)
          win.webContents.send('screenshot:init', init)
          await ready
        })()
      )
    }
    await Promise.all(boot)

    // 2) 系统栏动画藏在「已画好的冻屏」出现之前完成，减少抖感
    if (process.platform === 'darwin' && !this.macChromeHidden) {
      await setMacChromeHidden(true)
      this.macChromeHidden = true
    }

    // 3) 同一轮全部 show，避免逐屏闪
    for (const frame of frames) {
      const win = this.wins.get(frame.displayId)
      if (!win || win.isDestroyed()) continue
      const place = { ...frame.bounds }
      win.setFocusable(true)
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
      win.setAlwaysOnTop(true, 'screen-saver')
      win.setBounds(place)
      if (!win.isVisible()) {
        win.show()
      } else {
        win.moveTop()
      }
      win.setBounds(place)
      win.focus()
    }
  }

  updateWindows(allWindows: ShotWindowInfo[], windowPickAvailable: boolean): void {
    for (const [displayId, win] of this.wins) {
      if (win.isDestroyed() || !win.isVisible()) continue
      const display = screen.getAllDisplays().find((d) => d.id === displayId)
      if (!display) continue
      win.webContents.send('screenshot:windows', {
        windows: windowsOnDisplay(allWindows, {
          x: display.bounds.x,
          y: display.bounds.y,
          width: display.bounds.width,
          height: display.bounds.height
        }),
        windowPickAvailable
      })
    }
  }

  async hideAll(): Promise<void> {
    // 对齐剪贴板 hide：先松焦点再藏，避免系统把本应用其它窗抬到前台
    for (const win of this.wins.values()) {
      if (win.isDestroyed() || !win.isVisible()) continue
      if (win.isFocused()) win.blur()
      win.setAlwaysOnTop(false)
      win.setVisibleOnAllWorkspaces(false)
      if (process.platform === 'win32') {
        win.setFocusable(false)
        win.hide()
        win.setFocusable(true)
      } else {
        win.hide()
        win.setFocusable(false)
      }
    }
    if (process.platform === 'darwin' && this.macChromeHidden) {
      await setMacChromeHidden(false)
      this.macChromeHidden = false
      syncMacDockIcon()
      await delay(32)
    }
  }

  async destroyAll(): Promise<void> {
    for (const win of this.wins.values()) {
      if (!win.isDestroyed()) win.destroy()
    }
    this.wins.clear()
    this.ready.clear()
    for (const [, w] of this.contentWaiters) {
      clearTimeout(w.timer)
      w.resolve()
    }
    this.contentWaiters.clear()
    if (process.platform === 'darwin' && this.macChromeHidden) {
      await setMacChromeHidden(false)
      this.macChromeHidden = false
      syncMacDockIcon()
    }
  }

  get isActive(): boolean {
    for (const win of this.wins.values()) {
      if (!win.isDestroyed() && win.isVisible()) return true
    }
    return false
  }

  /** 供系统对话框作 parent（优先已聚焦的遮罩窗） */
  getDialogParent(): BrowserWindow | undefined {
    let fallback: BrowserWindow | undefined
    for (const win of this.wins.values()) {
      if (win.isDestroyed() || !win.isVisible()) continue
      if (win.isFocused()) return win
      fallback ??= win
    }
    return fallback
  }
}
