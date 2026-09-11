import { join } from 'path'
import { BrowserWindow, ipcMain, screen } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { RecorderOverlayInit } from '@shared/modules/recorder'
import type { ShotWindowInfo } from '@shared/modules/screenshot'
import { delay, loadRoute } from '../core/windows/loadRoute'
import { windowsOnDisplay } from '../screenshot/windowHit'

const execFileAsync = promisify(execFile)

/** macOS：临时隐藏菜单栏+程序坞，使遮罩可铺满 display.bounds */
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
    console.warn('[recorder] setPresentationOptions failed:', err)
  }
}

/**
 * 每块屏一个透明置顶框选遮罩（无冻屏，底下是实时桌面）。
 */
export class RecorderOverlayHost {
  private wins = new Map<number, BrowserWindow>()
  private ready = new Set<number>()
  private macChromeHidden = false
  private contentWaiters = new Map<
    number,
    { resolve: () => void; timer: ReturnType<typeof setTimeout> }
  >()

  constructor() {
    ipcMain.removeAllListeners('recorder:overlay-ready')
    ipcMain.on('recorder:overlay-ready', (_e, displayId: unknown) => {
      const id = Number(displayId)
      if (!Number.isFinite(id)) return
      this.resolveContentReady(id)
    })
  }

  prewarm(): void {
    for (const display of screen.getAllDisplays()) {
      this.ensureWindow(display.id, { ...display.bounds })
    }
  }

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

  private ensureWindow(
    displayId: number,
    place: { x: number; y: number; width: number; height: number }
  ): BrowserWindow {
    const existing = this.wins.get(displayId)
    if (existing && !existing.isDestroyed()) {
      if (!existing.isVisible()) existing.setBounds(place)
      return existing
    }

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
      alwaysOnTop: true,
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

    win.setAlwaysOnTop(true, 'screen-saver')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
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

    loadRoute(win, '/recorder-select')
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

  async showSession(inits: RecorderOverlayInit[]): Promise<void> {
    const activeIds = new Set(inits.map((i) => i.displayId))

    for (const [id, win] of this.wins) {
      if (!activeIds.has(id) && !win.isDestroyed() && win.isVisible()) {
        win.hide()
      }
    }

    const boot: Promise<void>[] = []
    for (const init of inits) {
      const place = { ...init.bounds }
      const win = this.ensureWindow(init.displayId, place)
      boot.push(
        (async () => {
          await this.waitPageReady(init.displayId)
          if (win.isDestroyed()) return
          win.setBounds(place)
          const ready = this.waitContentReady(init.displayId)
          win.webContents.send('recorder:select-init', init)
          await ready
        })()
      )
    }
    await Promise.all(boot)

    if (process.platform === 'darwin' && !this.macChromeHidden) {
      await setMacChromeHidden(true)
      this.macChromeHidden = true
    }

    for (const init of inits) {
      const win = this.wins.get(init.displayId)
      if (!win || win.isDestroyed()) continue
      const place = { ...init.bounds }
      win.setAlwaysOnTop(true, 'screen-saver')
      win.setBounds(place)
      if (!win.isVisible()) win.show()
      else win.moveTop()
      win.setBounds(place)
      win.focus()
    }
  }

  /** 异步补全本屏窗口列表（点选应用窗） */
  updateWindows(allWindows: ShotWindowInfo[], windowPickAvailable: boolean): void {
    for (const [displayId, win] of this.wins) {
      if (win.isDestroyed() || !win.isVisible()) continue
      const display = screen.getAllDisplays().find((d) => d.id === displayId)
      if (!display) continue
      win.webContents.send('recorder:select-windows', {
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
    for (const win of this.wins.values()) {
      if (win.isDestroyed() || !win.isVisible()) continue
      if (win.isFocused()) win.blur()
      if (process.platform === 'win32') {
        win.setAlwaysOnTop(false)
        win.setFocusable(false)
        win.hide()
        win.setFocusable(true)
      } else {
        win.hide()
      }
    }
    if (process.platform === 'darwin' && this.macChromeHidden) {
      await setMacChromeHidden(false)
      this.macChromeHidden = false
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
    }
  }

  get isActive(): boolean {
    for (const win of this.wins.values()) {
      if (!win.isDestroyed() && win.isVisible()) return true
    }
    return false
  }
}
