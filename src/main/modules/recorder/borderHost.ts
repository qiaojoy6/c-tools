import { join } from 'path'
import { pathToFileURL } from 'url'
import { app, BrowserWindow, ipcMain, screen, session } from 'electron'

const BORDER_PX = 3

/** 悬浮条固定尺寸（展开含系统声/麦/暂停/停止四键） */
const FLOAT_SIZE = { w: 168, h: 34 }
const FLOAT_MARGIN = 10

let mediaPermissionHooked = false

/** 允许悬浮条 getUserMedia 做麦音量表（系统 TCC 仍由 askForMediaAccess 管） */
function ensureMediaPermissionForMeter(): void {
  if (mediaPermissionHooked) return
  mediaPermissionHooked = true
  const ses = session.defaultSession
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media')
  })
  ses.setPermissionCheckHandler((_wc, permission) => permission === 'media')
}
export interface RecorderBorderRect {
  /** 屏幕坐标 DIP：选区左上角 */
  x: number
  y: number
  width: number
  height: number
}

export interface RecorderBorderActions {
  stop: () => void
  pause: () => void
  resume: () => void
}

/** 开录时音源初始状态（悬浮条开关与之一致） */
export interface RecorderBorderAudioOpts {
  enableMic?: boolean
  enableSystemAudio?: boolean
}

export interface RecorderBorderFloatPos {
  x: number
  y: number
}

/** 全屏悬浮条位置读写（区域录屏上下/左右都放不下时作回退） */
export interface RecorderBorderPosStore {
  getFullscreenFloatPos: () => RecorderBorderFloatPos | null
  setFullscreenFloatPos: (pos: RecorderBorderFloatPos) => void
}

type FloatMode = 'region' | 'fullscreen'

/**
 * 录制中 chrome：
 * - 区域：选区外框（`recorder-border.html`，仅描边）+ 统一悬浮条（`recorder-float.html`）
 * - 全屏：仅悬浮条（可拖放；位置持久化）
 */
export class RecorderBorderHost {
  private ringWin: BrowserWindow | null = null
  private floatWin: BrowserWindow | null = null
  private actions: RecorderBorderActions | null = null
  private posStore: RecorderBorderPosStore | null = null
  private floatMode: FloatMode = 'region'
  private paused = false
  private enableMic = true
  private enableSystemAudio = true
  private floatSize = { ...FLOAT_SIZE }
  private floatX = 0
  private floatY = 0
  private persistTimer: ReturnType<typeof setTimeout> | null = null

  constructor() {
    for (const ch of [
      'recorder:border-stop',
      'recorder:border-pause',
      'recorder:border-resume'
    ] as const) {
      ipcMain.removeHandler(ch)
    }
    ipcMain.removeAllListeners('recorder:chrome-ignore-mouse')
    ipcMain.removeAllListeners('recorder:float-layout')
    ipcMain.removeAllListeners('recorder:float-move')
    ipcMain.removeAllListeners('recorder:float-snap')

    ipcMain.handle('recorder:border-stop', () => {
      this.actions?.stop()
      return true
    })
    ipcMain.handle('recorder:border-pause', () => {
      this.actions?.pause()
      this.paused = true
      this.pushState()
      return true
    })
    ipcMain.handle('recorder:border-resume', () => {
      this.actions?.resume()
      this.paused = false
      this.pushState()
      return true
    })
    ipcMain.on('recorder:chrome-ignore-mouse', (_e, ignore: unknown) => {
      const win = this.floatWin
      if (!win || win.isDestroyed()) return
      win.setIgnoreMouseEvents(ignore !== false, { forward: true })
    })
    ipcMain.on('recorder:float-move', (_e, payload: unknown) => {
      if (!this.floatWin || this.floatWin.isDestroyed()) return
      if (!payload || typeof payload !== 'object') return
      const p = payload as { x?: number; y?: number }
      const rawX = Math.round(Number(p.x))
      const rawY = Math.round(Number(p.y))
      if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return
      // 允许拖到菜单栏区域；仅防止拖出屏幕
      const { x, y } = clampFloatToDisplay(rawX, rawY)
      this.floatX = x
      this.floatY = y
      this.floatWin.setBounds({
        x,
        y,
        width: this.floatSize.w,
        height: this.floatSize.h
      })
      // 仅全屏模式记住拖拽位置
      if (this.floatMode === 'fullscreen') {
        this.schedulePersistFullscreenPos()
      }
    })
  }

  setActions(actions: RecorderBorderActions | null): void {
    this.actions = actions
  }

  setPosStore(store: RecorderBorderPosStore | null): void {
    this.posStore = store
  }

  /** 区域录屏：选区外框 + 统一悬浮条（外框与工具条分离，避免贴边挤偏） */
  show(rect: RecorderBorderRect, audio?: RecorderBorderAudioOpts): void {
    this.hide({ persist: false })
    this.paused = false
    this.floatMode = 'region'
    this.applyAudioOpts(audio)

    const pad = BORDER_PX
    const ringPlace = {
      x: Math.round(rect.x - pad),
      y: Math.round(rect.y - pad),
      width: Math.max(pad * 2 + 2, Math.round(rect.width + pad * 2)),
      height: Math.max(pad * 2 + 2, Math.round(rect.height + pad * 2))
    }
    this.ringWin = this.createChromeWindow(ringPlace, resolveBorderHtmlPath(), 'mode=ring')
    // 外框始终点击穿透
    this.ringWin.setIgnoreMouseEvents(true, { forward: true })

    this.openFloatNear(rect)
  }

  /**
   * 全屏录屏：悬浮条（默认标识+计时；移入暂停/停止；自由拖放）。
   * `rect` 为整屏 bounds，用于定位所在显示器；优先用上次记住的位置。
   */
  showFloat(rect: RecorderBorderRect, audio?: RecorderBorderAudioOpts): void {
    this.hide({ persist: false })
    this.paused = false
    this.floatMode = 'fullscreen'
    this.applyAudioOpts(audio)

    const saved = this.posStore?.getFullscreenFloatPos() ?? null
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      const clamped = clampFloatToDisplay(saved.x, saved.y)
      this.openFloatAt(clamped.x, clamped.y)
      return
    }

    const display = screen.getDisplayNearestPoint({
      x: Math.round(rect.x + rect.width / 2),
      y: Math.round(rect.y + rect.height / 2)
    })
    const work = display.workArea
    this.openFloatAt(
      Math.round(work.x + work.width - FLOAT_SIZE.w - FLOAT_MARGIN),
      Math.round(work.y + (work.height - FLOAT_SIZE.h) / 2)
    )
  }

  hide(opts?: { persist?: boolean }): void {
    const shouldPersist = opts?.persist !== false
    if (shouldPersist && this.floatMode === 'fullscreen' && this.floatWin) {
      this.persistFullscreenPosNow()
    }
    this.clearPersistTimer()
    this.destroyWin(this.ringWin)
    this.destroyWin(this.floatWin)
    this.ringWin = null
    this.floatWin = null
    this.paused = false
    this.enableMic = true
    this.enableSystemAudio = true
    this.floatMode = 'region'
  }

  updateElapsed(elapsedMs: number): void {
    if (!this.floatWin || this.floatWin.isDestroyed()) return
    this.floatWin.webContents.send('recorder:border-tick', {
      elapsedMs: Math.max(0, Math.floor(elapsedMs)),
      paused: this.paused
    })
  }

  setPaused(paused: boolean): void {
    this.paused = paused
    this.pushState()
  }

  get isVisible(): boolean {
    return (
      (!!this.floatWin && !this.floatWin.isDestroyed() && this.floatWin.isVisible()) ||
      (!!this.ringWin && !this.ringWin.isDestroyed() && this.ringWin.isVisible())
    )
  }

  private applyAudioOpts(audio?: RecorderBorderAudioOpts): void {
    this.enableMic = audio?.enableMic !== false
    this.enableSystemAudio = audio?.enableSystemAudio !== false
  }

  /**
   * 区域录制悬浮条落点：
   * 1. 优先选区下方居中，不够则上方
   * 2. 上下都不够：试右侧，再左侧（竖直居中于选区）
   * 3. 仍放不下：用全屏录制记住的悬浮条位置；再无则贴工作区右侧中部
   */
  private openFloatNear(rect: RecorderBorderRect): void {
    const display = screen.getDisplayNearestPoint({
      x: Math.round(rect.x + rect.width / 2),
      y: Math.round(rect.y + rect.height / 2)
    })
    const work = display.workArea
    const w = FLOAT_SIZE.w
    const h = FLOAT_SIZE.h
    const gap = FLOAT_MARGIN
    const edge = 4

    const fitsY = (y: number): boolean =>
      y >= work.y + edge && y + h <= work.y + work.height - edge
    const fitsX = (x: number): boolean =>
      x >= work.x + edge && x + w <= work.x + work.width - edge

    const clampX = (x: number): number =>
      Math.max(work.x + FLOAT_MARGIN, Math.min(x, work.x + work.width - w - FLOAT_MARGIN))
    const clampY = (y: number): number =>
      Math.max(work.y + FLOAT_MARGIN, Math.min(y, work.y + work.height - h - FLOAT_MARGIN))

    // 1) 上下
    const cx = Math.round(rect.x + (rect.width - w) / 2)
    const belowY = Math.round(rect.y + rect.height + BORDER_PX + gap)
    const aboveY = Math.round(rect.y - BORDER_PX - gap - h)
    if (fitsY(belowY)) {
      this.openFloatAt(clampX(cx), belowY)
      return
    }
    if (fitsY(aboveY)) {
      this.openFloatAt(clampX(cx), aboveY)
      return
    }

    // 2) 左右（竖直相对选区居中）
    const cy = Math.round(rect.y + (rect.height - h) / 2)
    const rightX = Math.round(rect.x + rect.width + BORDER_PX + gap)
    const leftX = Math.round(rect.x - BORDER_PX - gap - w)
    if (fitsX(rightX)) {
      this.openFloatAt(rightX, clampY(cy))
      return
    }
    if (fitsX(leftX)) {
      this.openFloatAt(leftX, clampY(cy))
      return
    }

    // 3) 回退全屏录制记住的位置
    const saved = this.posStore?.getFullscreenFloatPos() ?? null
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      const clamped = clampFloatToDisplay(saved.x, saved.y)
      this.openFloatAt(clamped.x, clamped.y)
      return
    }

    // 最终兜底：工作区右侧中部（与全屏默认一致）
    this.openFloatAt(
      Math.round(work.x + work.width - w - FLOAT_MARGIN),
      Math.round(work.y + (work.height - h) / 2)
    )
  }

  private openFloatAt(x: number, y: number): void {
    this.floatSize = { ...FLOAT_SIZE }
    this.floatX = x
    this.floatY = y
    const place = { x, y, width: this.floatSize.w, height: this.floatSize.h }
    this.floatWin = this.createChromeWindow(place, resolveFloatHtmlPath(), 'mode=float')
  }

  private schedulePersistFullscreenPos(): void {
    this.clearPersistTimer()
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null
      this.persistFullscreenPosNow()
    }, 250)
  }

  private persistFullscreenPosNow(): void {
    if (this.floatMode !== 'fullscreen') return
    const clamped = clampFloatToDisplay(this.floatX, this.floatY)
    this.floatX = clamped.x
    this.floatY = clamped.y
    this.posStore?.setFullscreenFloatPos({ x: clamped.x, y: clamped.y })
  }

  private clearPersistTimer(): void {
    if (!this.persistTimer) return
    clearTimeout(this.persistTimer)
    this.persistTimer = null
  }

  private createChromeWindow(
    place: { x: number; y: number; width: number; height: number },
    htmlPath: string,
    query: string
  ): BrowserWindow {
    if (query.includes('mode=float')) ensureMediaPermissionForMeter()
    const win = new BrowserWindow({
      ...place,
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
      focusable: true,
      show: false,
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
    win.setContentProtection(true)
    win.setIgnoreMouseEvents(true, { forward: true })
    if (process.platform === 'darwin') win.setWindowButtonVisibility(false)

    const url = `${pathToFileURL(htmlPath).href}?${query}`
    void win.loadURL(url)

    win.once('ready-to-show', () => {
      if (win.isDestroyed()) return
      win.setBounds(place)
      win.showInactive()
      // 悬浮条：推送暂停态 + 开录音源初值（之后由条内本地维护开关）
      if (this.floatWin === win) {
        this.floatWin.webContents.send('recorder:border-state', {
          paused: this.paused,
          enableMic: this.enableMic,
          enableSystemAudio: this.enableSystemAudio
        })
      }
    })
    win.on('closed', () => {
      if (this.floatWin === win) this.floatWin = null
      if (this.ringWin === win) this.ringWin = null
    })
    return win
  }

  private destroyWin(win: BrowserWindow | null): void {
    if (!win || win.isDestroyed()) return
    try {
      win.destroy()
    } catch {
      /* ignore */
    }
  }

  private pushState(): void {
    if (!this.floatWin || this.floatWin.isDestroyed()) return
    this.floatWin.webContents.send('recorder:border-state', { paused: this.paused })
  }
}

/** 钳在整屏 bounds 内（含菜单栏/程序坞区域），只避免拖出屏幕外 */
function clampFloatToDisplay(x: number, y: number): RecorderBorderFloatPos {
  const display = screen.getDisplayNearestPoint({ x, y })
  const area = display.bounds
  const w = FLOAT_SIZE.w
  const h = FLOAT_SIZE.h
  const margin = 2
  return {
    x: Math.max(area.x + margin, Math.min(Math.round(x), area.x + area.width - w - margin)),
    y: Math.max(area.y + margin, Math.min(Math.round(y), area.y + area.height - h - margin))
  }
}

function resolveBorderHtmlPath(): string {
  if (!app.isPackaged) {
    return join(app.getAppPath(), 'src/renderer/recorder-border.html')
  }
  return join(__dirname, '../renderer/recorder-border.html')
}

function resolveFloatHtmlPath(): string {
  if (!app.isPackaged) {
    return join(app.getAppPath(), 'src/renderer/recorder-float.html')
  }
  return join(__dirname, '../renderer/recorder-float.html')
}
