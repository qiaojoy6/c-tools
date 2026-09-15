import { join } from 'path'
import { BrowserWindow, ipcMain, screen } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { delay, loadRoute } from '../core/windows/loadRoute'
import { reassertMacDockHiddenIfNeeded } from '../core/windows/macDockIcon'
import type { ShotDisplayFrame, ShotOverlayInit, ShotRect, ShotWindowInfo } from '@shared/types'
import { shotImageUrl } from './protocol'
import { windowsOnDisplay } from './windowHit'

const execFileAsync = promisify(execFile)

/**
 * 仅 HideMenuBar（不用 HideDock，避免程序坞图标抖动）。
 * 露出遮罩前藏菜单栏，盖住「窗刚出来」那一帧的顶部闪动。
 */
async function setMacMenuBarHidden(hidden: boolean): Promise<void> {
  if (process.platform !== 'darwin') return
  const opts = hidden ? 4 : 0
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
 * 每块屏一个置顶冻屏遮罩。
 * - 不透明黑底：首帧未合成时不会透出实时桌面（第一次截屏最明显）
 * - 隐藏态灌图 → HideMenuBar → 再 show
 * - macOS panel 仅用于剪贴板等小浮层；全屏遮罩不用 panel（会刷 styleMask 0x80 警告）
 */
export class ScreenshotOverlayHost {
  private wins = new Map<number, BrowserWindow>()
  private ready = new Set<number>()
  private menuBarHidden = false
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

  /** 按显示器全尺寸预热（保持隐藏、不置顶），避免首次从 8×8 拉满闪一下 */
  prewarm(): void {
    for (const display of screen.getAllDisplays()) {
      this.ensureWindow(display.id, {
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height
      })
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

  private ensureWindow(displayId: number, place: ShotRect): BrowserWindow {
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
      // 冻屏铺满整窗，无需透明；透明首帧会透出实时桌面造成闪一下
      transparent: false,
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
      backgroundColor: '#000000',
      // 不用 type:panel：全屏冻屏遮罩会触发
      // 「NSWindow does not support nonactivating panel styleMask 0x80」刷屏；
      // 程序坞靠 accessory 策略，不依赖 panel。
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
      const existing = this.contentWaiters.get(displayId)
      if (existing) {
        clearTimeout(existing.timer)
        existing.resolve = resolve
        existing.timer = setTimeout(() => {
          this.contentWaiters.delete(displayId)
          resolve()
        }, timeoutMs)
        return
      }
      const timer = setTimeout(() => {
        this.contentWaiters.delete(displayId)
        resolve()
      }, timeoutMs)
      this.contentWaiters.set(displayId, { resolve, timer })
    })
  }

  private resolveContentReady(displayId: number): void {
    const w = this.contentWaiters.get(displayId)
    if (!w) return
    clearTimeout(w.timer)
    this.contentWaiters.delete(displayId)
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

    // 1) 隐藏窗内灌冻屏图，等双 rAF ready
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
    // 给合成器一帧，减少首次 show 空帧
    await delay(16)

    // 2) 再藏菜单栏（盖住露脸瞬间）
    if (process.platform === 'darwin' && !this.menuBarHidden) {
      reassertMacDockHiddenIfNeeded()
      await setMacMenuBarHidden(true)
      this.menuBarHidden = true
    }

    // 3) 同一轮 show
    for (const frame of frames) {
      const win = this.wins.get(frame.displayId)
      if (!win || win.isDestroyed()) continue
      const place = { ...frame.bounds }
      win.setFocusable(true)
      win.setAlwaysOnTop(true, 'screen-saver')
      win.setBounds(place)
      if (!win.isVisible()) {
        if (process.platform === 'darwin') win.showInactive()
        else win.show()
      } else {
        win.moveTop()
      }
      win.setBounds(place)
      win.focus()
    }
    reassertMacDockHiddenIfNeeded()
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
    reassertMacDockHiddenIfNeeded()
    for (const win of this.wins.values()) {
      if (win.isDestroyed() || !win.isVisible()) continue
      if (win.isFocused()) win.blur()
      win.setAlwaysOnTop(false)
      if (process.platform === 'win32') {
        win.setFocusable(false)
        win.hide()
        win.setFocusable(true)
      } else {
        win.hide()
        win.setFocusable(false)
      }
    }
    if (process.platform === 'darwin' && this.menuBarHidden) {
      await setMacMenuBarHidden(false)
      this.menuBarHidden = false
    }
    reassertMacDockHiddenIfNeeded()
  }

  async destroyAll(): Promise<void> {
    reassertMacDockHiddenIfNeeded()
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
    if (process.platform === 'darwin' && this.menuBarHidden) {
      await setMacMenuBarHidden(false)
      this.menuBarHidden = false
    }
    reassertMacDockHiddenIfNeeded()
  }

  get isActive(): boolean {
    for (const win of this.wins.values()) {
      if (!win.isDestroyed() && win.isVisible()) return true
    }
    return false
  }

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
