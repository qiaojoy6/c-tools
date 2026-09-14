import { randomUUID } from 'crypto'
import { dialog, screen, type Display } from 'electron'
import type {
  RecorderDeviceInfo,
  RecorderOverlayInit,
  RecorderSelectConfirm,
  RecorderVideoQuality
} from '../../../shared/modules/recorder'
import type { AppWindowVisibility } from '../core/windows/windowManager'
import { delay } from '../core/windows/loadRoute'
import {
  hasScreenCapturePermission,
  openScreenCaptureSettings
} from '../screenshot/permission'
import { listAppWindows } from '../screenshot/windowHit'
import type { RecorderHost } from './host'
import { hasMicPermission, hasSystemAudioPermission } from './permission'
import { RecorderOverlayHost } from './overlayHost'
import { RecorderBorderHost } from './borderHost'
import { RecorderFullscreenHost } from './fullscreenHost'
import { promptSaveRecording } from './saveRecording'

export interface RecorderSelectSessionDeps {
  host: RecorderHost
  /** 记下显隐并隐藏本应用窗 */
  hideAppWindows: () => AppWindowVisibility
  /** 采外部前台（被盖住时不还原自家窗） */
  captureExternalFocus: () => Promise<string | null>
  settleAfterSelect: (opts: {
    hideOverlays: () => Promise<void>
    visibility: AppWindowVisibility | null
    external: string | null
    restoreFocus: boolean
  }) => Promise<void>
  /** 录制状态变化后刷新托盘等 */
  onRecordingChanged?: () => void
  /** 全屏悬浮条位置读写 */
  getFullscreenFloatPos: () => { x: number; y: number } | null
  setFullscreenFloatPos: (pos: { x: number; y: number }) => void
  /** 开录选项写回配置 */
  persistRecorderPrefs?: (prefs: {
    enableMic: boolean
    enableSystemAudio: boolean
    quality: RecorderVideoQuality
    micDeviceId?: string | null
  }) => void
}

/**
 * 录屏会话：区域框选（点选应用窗/拖拽）或全屏选屏后开录。
 */
export class RecorderSelectSession {
  private active = false
  private sessionId = ''
  private savedVisibility: AppWindowVisibility | null = null
  private savedExternal: string | null = null
  private suppressActivate = false
  private readonly overlays = new RecorderOverlayHost()
  private readonly border = new RecorderBorderHost()
  private readonly fullscreen = new RecorderFullscreenHost()
  private startSeq = 0
  private cleaning = false
  /** 用户主动停止后，等 finished 再弹另存为 */
  private promptSaveOnFinish = false
  /** 避免 finished 重复弹窗 */
  private savePromptRunning = false

  constructor(private deps: RecorderSelectSessionDeps) {
    this.border.setPosStore({
      getFullscreenFloatPos: () => this.deps.getFullscreenFloatPos(),
      setFullscreenFloatPos: (pos) => this.deps.setFullscreenFloatPos(pos)
    })
    this.border.setActions({
      stop: () => {
        this.stopRecording({ promptSave: true })
      },
      pause: () => {
        try {
          this.deps.host.pause()
        } catch (err) {
          console.error('[recorder] border pause failed:', err)
        } finally {
          this.deps.onRecordingChanged?.()
        }
      },
      resume: () => {
        try {
          this.deps.host.resume()
        } catch (err) {
          console.error('[recorder] border resume failed:', err)
        } finally {
          this.deps.onRecordingChanged?.()
        }
      }
    })
    // 进度推到录制悬浮条（区域/全屏共用）
    this.deps.host.onEvent((event) => {
      if (event.type === 'progress') {
        this.border.updateElapsed(event.elapsedMs)
      } else if (event.type === 'stateChanged') {
        if (event.state === 'paused') this.border.setPaused(true)
        else if (event.state === 'recording') this.border.setPaused(false)
      } else if (event.type === 'finished') {
        this.border.hide()
        this.deps.onRecordingChanged?.()
        if (this.promptSaveOnFinish) {
          this.promptSaveOnFinish = false
          void this.runSavePrompt(event.outputPath)
        }
      }
    })
  }

  /**
   * 停止录制；`promptSave` 为 true 时成片就绪后弹自定义保存路径。
   */
  stopRecording(opts?: { promptSave?: boolean }): void {
    const promptSave = opts?.promptSave !== false
    try {
      const st = this.deps.host.status()
      if (st.state === 'recording' || st.state === 'paused') {
        this.promptSaveOnFinish = promptSave
        this.deps.host.stop()
      }
    } catch (err) {
      console.error('[recorder] stop failed:', err)
      this.promptSaveOnFinish = false
    } finally {
      this.border.hide()
      this.deps.onRecordingChanged?.()
    }
  }

  private async runSavePrompt(outputPath: string): Promise<void> {
    if (this.savePromptRunning) return
    this.savePromptRunning = true
    try {
      // 弹窗前再收一次，避免 parent 选错时遮罩被抬起
      this.border.hide()
      await this.overlays.hideAll()
      await promptSaveRecording(outputPath)
    } catch (err) {
      console.error('[recorder] save prompt failed:', err)
    } finally {
      this.border.hide()
      void this.overlays.hideAll()
      this.savePromptRunning = false
      this.deps.onRecordingChanged?.()
    }
  }

  get isActive(): boolean {
    return this.active || this.fullscreen.isOpen
  }

  get blocksPanelActivate(): boolean {
    return this.active || this.fullscreen.isOpen || this.suppressActivate
  }

  /** 停止录制或结束后收起范围外框 / 悬浮球 */
  hideRecordingBorder(): void {
    this.border.hide()
  }

  prewarm(): void {
    try {
      this.overlays.prewarm()
      for (const d of screen.getAllDisplays()) {
        void this.overlays.waitPageReady(d.id)
      }
    } catch (err) {
      console.warn('[recorder] select prewarm failed:', err)
    }
  }

  /** 区域录屏：多屏透明遮罩，点选应用窗或拖拽框选 */
  async startRegion(): Promise<void> {
    if (this.active || this.fullscreen.isOpen) {
      await this.cancelAsync()
      return
    }
    if (!(await this.ensureCanRecord())) return

    const seq = ++this.startSeq
    this.active = true
    this.sessionId = randomUUID()
    this.savedExternal = await this.deps.captureExternalFocus()

    try {
      this.savedVisibility = this.deps.hideAppWindows()
      await delay(16)
      if (seq !== this.startSeq) return

      let screens: RecorderDeviceInfo[] = []
      try {
        screens = this.deps.host.listScreens()
      } catch (err) {
        console.warn('[recorder] listScreens failed:', err)
      }

      const displays = screen.getAllDisplays()
      if (!displays.length) {
        dialog.showErrorBox('录屏失败', '未检测到显示器。')
        await this.finishCleanupAsync({ restoreFocus: true })
        return
      }

      const inits: RecorderOverlayInit[] = displays.map((d) =>
        buildOverlayInit(d, screens, this.sessionId)
      )
      await this.overlays.showSession(inits)
      void this.fillWindowsAsync(seq)
    } catch (err) {
      console.error('[recorder] region start failed:', err)
      dialog.showErrorBox('录屏失败', err instanceof Error ? err.message : String(err))
      await this.finishCleanupAsync({ restoreFocus: true })
    }
  }

  /**
   * 全屏录屏：自定义弹窗选屏（列表来自 Rust xcap），可选麦克风/系统声/清晰度，不传 region。
   */
  async startFullscreen(): Promise<void> {
    // 选屏弹窗已开：再点视为取消
    if (this.fullscreen.isOpen) {
      await this.cancelAsync()
      return
    }
    // 区域框选中：先收起再进入全屏选屏
    if (this.active) {
      await this.cancelAsync()
    }
    if (!(await this.ensureCanRecord())) return

    const seq = ++this.startSeq
    this.sessionId = randomUUID()

    let screens: RecorderDeviceInfo[] = []
    try {
      screens = this.deps.host.listScreens()
    } catch (err) {
      dialog.showErrorBox(
        '录屏失败',
        err instanceof Error ? err.message : '无法枚举显示器（Rust / xcap）'
      )
      return
    }
    if (!screens.length) {
      dialog.showErrorBox('录屏失败', '未检测到显示器。')
      return
    }

    const confirmed = await this.fullscreen.pick(screens, this.sessionId)
    if (seq !== this.startSeq) return
    if (!confirmed) {
      this.sessionId = ''
      return
    }

    const enableMic = confirmed.enableMic !== false && hasMicPermission()
    const enableSystemAudio =
      confirmed.enableSystemAudio !== false && hasSystemAudioPermission()
    const fps = clampFps(confirmed.fps)
    const quality = clampQuality(confirmed.quality)
    const micDeviceId = confirmed.micDeviceId?.trim() || undefined
    this.deps.persistRecorderPrefs?.({
      enableMic,
      enableSystemAudio,
      quality,
      micDeviceId: micDeviceId ?? null
    })
    const screenId = confirmed.screenId.trim()
    const device = screens.find((s) => s.id === screenId) ?? screens[0]!

    this.savedExternal = await this.deps.captureExternalFocus()
    this.savedVisibility = this.deps.hideAppWindows()
    await delay(16)

    try {
      const result = await this.deps.host.start({
        screenId: device.id,
        enableMic,
        enableSystemAudio,
        micDeviceId,
        fps,
        quality
      })
      console.info('[recorder] fullscreen started:', result.outputPath)
      const display = findDisplayForScreen(device, screen.getAllDisplays())
      if (display) {
        this.border.showFloat(
          {
            x: display.bounds.x,
            y: display.bounds.y,
            width: display.bounds.width,
            height: display.bounds.height
          },
          { enableMic, enableSystemAudio }
        )
      }
      // 开录后还原本应用窗
      await this.deps.settleAfterSelect({
        hideOverlays: async () => {},
        visibility: this.savedVisibility,
        external: this.savedExternal,
        restoreFocus: false
      })
      this.savedVisibility = null
      this.savedExternal = null
      this.sessionId = ''
      this.deps.onRecordingChanged?.()
    } catch (err) {
      console.error('[recorder] fullscreen start failed:', err)
      this.border.hide()
      await this.deps.settleAfterSelect({
        hideOverlays: async () => {},
        visibility: this.savedVisibility,
        external: this.savedExternal,
        restoreFocus: true
      })
      this.savedVisibility = null
      this.savedExternal = null
      this.sessionId = ''
      dialog.showErrorBox('录屏失败', err instanceof Error ? err.message : String(err))
    }
  }

  cancel(): void {
    void this.cancelAsync()
  }

  async cancelAsync(): Promise<void> {
    this.startSeq++
    if (this.fullscreen.isOpen) {
      this.fullscreen.close()
    }
    if (!this.active && !this.overlays.isActive) {
      this.sessionId = ''
      return
    }
    await this.finishCleanupAsync({ restoreFocus: true })
  }

  /** 框选确认：先关遮罩，再按区域开始录制 */
  async confirm(payload: RecorderSelectConfirm): Promise<{ outputPath: string } | null> {
    if (!this.active) return null

    const region = dipToPhysical(payload.regionDip, payload.scaleFactor)
    if (!region) {
      dialog.showErrorBox('录屏失败', '选区过小，请重新框选。')
      return null
    }

    const screenId = payload.screenId?.trim() || undefined
    const enableMic = payload.enableMic !== false && hasMicPermission()
    const enableSystemAudio =
      payload.enableSystemAudio !== false && hasSystemAudioPermission()
    const fps = clampFps(payload.fps)
    const quality = clampQuality(payload.quality)
    const micDeviceId = payload.micDeviceId?.trim() || undefined
    this.deps.persistRecorderPrefs?.({
      enableMic,
      enableSystemAudio,
      quality,
      micDeviceId: micDeviceId ?? null
    })

    // 先收遮罩，短暂等待后再采屏，避免把框选 UI 录进去
    await this.finishCleanupAsync({ restoreFocus: false })
    await delay(80)

    try {
      const result = await this.deps.host.start({
        screenId,
        region,
        enableMic,
        enableSystemAudio,
        micDeviceId,
        fps,
        quality
      })
      console.info('[recorder] started:', result.outputPath)
      const display = screen.getAllDisplays().find((d) => d.id === payload.displayId)
      const origin = display?.bounds ?? { x: 0, y: 0 }
      this.border.show(
        {
          x: origin.x + payload.regionDip.x,
          y: origin.y + payload.regionDip.y,
          width: payload.regionDip.width,
          height: payload.regionDip.height
        },
        { enableMic, enableSystemAudio }
      )
      this.deps.onRecordingChanged?.()
      return result
    } catch (err) {
      console.error('[recorder] start after select failed:', err)
      this.border.hide()
      dialog.showErrorBox('录屏失败', err instanceof Error ? err.message : String(err))
      return null
    }
  }

  private async fillWindowsAsync(seq: number): Promise<void> {
    try {
      const windows = await listAppWindows()
      if (seq !== this.startSeq || !this.active) return
      this.overlays.updateWindows(windows, windows.length > 0)
    } catch (err) {
      console.warn('[recorder] window list async failed:', err)
    }
  }

  private async ensureCanRecord(): Promise<boolean> {
    const st = this.deps.host.status()
    if (!st.available) {
      dialog.showErrorBox('录屏不可用', st.reason ?? 'native addon not loaded')
      return false
    }
    if (st.state === 'recording' || st.state === 'paused' || st.state === 'stopping') {
      return false
    }
    if (!hasScreenCapturePermission()) {
      const { response } = await dialog.showMessageBox({
        type: 'warning',
        title: '需要屏幕录制权限',
        message: '录屏需要「屏幕录制」权限才能捕获画面。',
        detail: '请在系统设置中允许 c-tools 使用屏幕录制，然后重新尝试。',
        buttons: ['打开系统设置', '取消'],
        defaultId: 0,
        cancelId: 1
      })
      if (response === 0) await openScreenCaptureSettings()
      return false
    }
    return true
  }

  private async finishCleanupAsync(opts: { restoreFocus: boolean }): Promise<void> {
    if (this.cleaning) return
    this.cleaning = true
    this.suppressActivate = true
    try {
      const visibility = this.savedVisibility
      this.savedVisibility = null
      const external = this.savedExternal
      this.savedExternal = null

      await this.deps.settleAfterSelect({
        hideOverlays: () => this.overlays.hideAll(),
        visibility,
        external,
        restoreFocus: opts.restoreFocus
      })

      this.sessionId = ''
      this.active = false
    } finally {
      this.cleaning = false
      setTimeout(() => {
        this.suppressActivate = false
      }, 400)
    }
  }
}

function buildOverlayInit(
  display: Display,
  screens: RecorderDeviceInfo[],
  sessionId: string
): RecorderOverlayInit {
  const bounds = {
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height
  }
  const workArea = {
    x: display.workArea.x,
    y: display.workArea.y,
    width: display.workArea.width,
    height: display.workArea.height
  }
  return {
    sessionId,
    displayId: display.id,
    bounds,
    workArea,
    viewportOffset: { x: 0, y: 0 },
    scaleFactor: display.scaleFactor,
    screenId: matchScreenId(display, screens),
    windows: [],
    windowPickAvailable: false
  }
}

/** Electron display → xcap screen id（优先 id，其次物理尺寸，再主屏） */
function matchScreenId(display: Display, screens: RecorderDeviceInfo[]): string {
  if (!screens.length) return String(display.id)
  const byId = screens.find((s) => s.id === String(display.id))
  if (byId) return byId.id

  const physW = Math.round(display.size.width * display.scaleFactor)
  const physH = Math.round(display.size.height * display.scaleFactor)
  const bySize = screens.find((s) => s.width === physW && s.height === physH)
  if (bySize) return bySize.id

  if (screen.getPrimaryDisplay().id === display.id) {
    const primary = screens.find((s) => s.isPrimary)
    if (primary) return primary.id
  }
  return screens[0]!.id
}

/** xcap DeviceInfo → 对应 Electron Display（悬浮球定位） */
function findDisplayForScreen(
  device: RecorderDeviceInfo,
  displays: Display[]
): Display | undefined {
  const byId = displays.find((d) => String(d.id) === device.id)
  if (byId) return byId
  const matched = displays.find((d) => matchScreenId(d, [device]) === device.id)
  if (matched) return matched
  if (device.isPrimary) return screen.getPrimaryDisplay()
  return displays[0]
}

function dipToPhysical(
  dip: { x: number; y: number; width: number; height: number },
  scaleFactor: number
): { x: number; y: number; width: number; height: number } | null {
  const sf = Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1
  const x = Math.max(0, Math.floor(dip.x * sf))
  const y = Math.max(0, Math.floor(dip.y * sf))
  // H.264 要偶数边；向偶数取整
  let width = Math.max(0, Math.floor(dip.width * sf))
  let height = Math.max(0, Math.floor(dip.height * sf))
  width -= width % 2
  height -= height % 2
  if (width < 2 || height < 2) return null
  return { x, y, width, height }
}

function clampFps(fps: unknown): number {
  const n = Math.floor(Number(fps) || 30)
  return Math.min(60, Math.max(1, n))
}

function clampQuality(q: unknown): 'original' | 'ultra' | 'smooth' {
  if (q === 'ultra' || q === 'smooth' || q === 'original') return q
  return 'original'
}
