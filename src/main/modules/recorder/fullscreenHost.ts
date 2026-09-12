import { join } from 'path'
import { BrowserWindow, ipcMain, screen } from 'electron'
import type {
  RecorderDeviceInfo,
  RecorderFullscreenConfirm,
  RecorderFullscreenInit
} from '../../../shared/modules/recorder'
import { loadRoute } from '../core/windows/loadRoute'

const WIN_W = 420
const WIN_H = 460

/**
 * 全屏录屏选屏弹窗：独立置顶窗，加载 `/recorder-fullscreen`。
 * 用户确认后回传 screenId + 麦克风/系统声/清晰度。
 */
export class RecorderFullscreenHost {
  private win: BrowserWindow | null = null
  private pending: {
    resolve: (value: RecorderFullscreenConfirm | null) => void
  } | null = null
  private ready = false
  private contentWaiter: { resolve: () => void; timer: ReturnType<typeof setTimeout> } | null =
    null

  constructor() {
    for (const ch of ['recorder:fullscreen-confirm', 'recorder:fullscreen-cancel'] as const) {
      ipcMain.removeHandler(ch)
    }
    ipcMain.removeAllListeners('recorder:fullscreen-ready')

    ipcMain.on('recorder:fullscreen-ready', () => {
      this.ready = true
      this.resolveContentReady()
    })

    ipcMain.handle(
      'recorder:fullscreen-confirm',
      (_e, payload: RecorderFullscreenConfirm): boolean => {
        if (!this.pending) return false
        if (!payload || typeof payload !== 'object') return false
        const screenId = String(payload.screenId ?? '').trim()
        if (!screenId) return false
        this.finish({
          screenId,
          enableMic: payload.enableMic !== false,
          enableSystemAudio: payload.enableSystemAudio !== false,
          micDeviceId: payload.micDeviceId?.trim() || undefined,
          fps: payload.fps,
          quality: payload.quality
        })
        return true
      }
    )

    ipcMain.handle('recorder:fullscreen-cancel', (): boolean => {
      this.finish(null)
      return true
    })
  }

  get isOpen(): boolean {
    return !!this.win && !this.win.isDestroyed()
  }

  /**
   * 弹出选屏窗；取消或关闭返回 null。
   */
  async pick(
    screens: RecorderDeviceInfo[],
    _sessionId: string
  ): Promise<RecorderFullscreenConfirm | null> {
    // 已有弹窗则先取消挂起
    this.close()

    return new Promise((resolve) => {
      this.pending = { resolve }

      const cursor = screen.getCursorScreenPoint()
      const display = screen.getDisplayNearestPoint(cursor)
      const { workArea } = display
      const x = Math.round(workArea.x + (workArea.width - WIN_W) / 2)
      const y = Math.round(workArea.y + (workArea.height - WIN_H) / 2)

      const win = new BrowserWindow({
        width: WIN_W,
        height: WIN_H,
        x,
        y,
        frame: false,
        transparent: false,
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        hasShadow: true,
        show: false,
        backgroundColor: '#ffffff',
        title: '全屏录制',
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          sandbox: false
        }
      })
      win.setAlwaysOnTop(true, 'screen-saver')
      if (process.platform === 'darwin') win.setWindowButtonVisibility(false)

      win.on('closed', () => {
        if (this.win === win) this.win = null
        // 未确认就关窗 = 取消
        if (this.pending) this.finish(null)
      })

      this.win = win
      this.ready = false
      loadRoute(win, '/recorder-fullscreen')

      void (async () => {
        try {
          await this.waitContentReady(8000)
          if (!this.win || this.win.isDestroyed() || this.win !== win) return
          const init: RecorderFullscreenInit = { sessionId: _sessionId, screens }
          win.webContents.send('recorder:fullscreen-init', init)
          if (!win.isDestroyed()) {
            win.show()
            win.focus()
          }
        } catch (err) {
          console.error('[recorder] fullscreen dialog failed:', err)
          this.finish(null)
        }
      })()
    })
  }

  /** 关闭弹窗；有挂起 Promise 时 resolve null */
  close(): void {
    if (this.pending) {
      this.finish(null)
      return
    }
    this.destroyWin()
  }

  private finish(value: RecorderFullscreenConfirm | null): void {
    const pending = this.pending
    this.pending = null
    this.destroyWin()
    pending?.resolve(value)
  }

  private destroyWin(): void {
    const win = this.win
    this.win = null
    this.ready = false
    this.clearContentWaiter()
    if (win && !win.isDestroyed()) {
      try {
        win.destroy()
      } catch {
        /* ignore */
      }
    }
  }

  private waitContentReady(timeoutMs: number): Promise<void> {
    if (this.ready && this.win && !this.win.isDestroyed() && !this.win.webContents.isLoading()) {
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      this.clearContentWaiter()
      this.contentWaiter = {
        resolve,
        timer: setTimeout(() => {
          this.contentWaiter = null
          resolve()
        }, timeoutMs)
      }
    })
  }

  private resolveContentReady(): void {
    const w = this.contentWaiter
    if (!w) return
    clearTimeout(w.timer)
    this.contentWaiter = null
    w.resolve()
  }

  private clearContentWaiter(): void {
    if (!this.contentWaiter) return
    clearTimeout(this.contentWaiter.timer)
    this.contentWaiter = null
  }
}
