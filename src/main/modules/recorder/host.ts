import { app } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { arch, platform } from 'process'
import type {
  RecorderDeviceInfo,
  RecorderNativeEvent,
  RecorderStartOptions,
  RecorderState,
  RecorderStatus
} from '@shared/modules/recorder'
import {
  hasMicPermission,
  hasSystemAudioPermission,
  requestMicPermission
} from './permission'

/** napi 插件导出的最小面 */
interface NativeRecorder {
  listScreens: () => RecorderDeviceInfo[]
  listMics: () => RecorderDeviceInfo[]
  listSystemOutputs: () => RecorderDeviceInfo[]
  startRecord: (config: {
    screenId?: string
    enableMic?: boolean
    enableSystemAudio?: boolean
    micDeviceId?: string
    systemDeviceId?: string
    fps?: number
    quality?: string
    outputPath: string
    ffmpegPath?: string
    region?: { x: number; y: number; width: number; height: number }
  }) => void
  stopRecord: () => void
  pauseRecord: () => void
  resumeRecord: () => void
  setMicEnabled: (enabled: boolean) => void
  setSystemAudioEnabled: (enabled: boolean) => void
  getState: () => string
  onEvent: (cb: (event: RecorderNativeEvent) => void) => void
}

type EventListener = (event: RecorderNativeEvent) => void

/**
 * 主进程录屏封装：按平台加载 native/*.node，对外统一 API。
 */
export class RecorderHost {
  private native: NativeRecorder | null = null
  private loadError: string | null = null
  private elapsedMs = 0
  private lastOutputPath: string | undefined
  private listeners = new Set<EventListener>()

  /** 尝试加载插件（可重复调用） */
  load(): boolean {
    if (this.native) return true
    if (this.loadError) return false

    try {
      const file = this.resolveNodeFile()
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require(file) as NativeRecorder
      mod.onEvent((event) => this.handleNativeEvent(event))
      this.native = mod
      return true
    } catch (err) {
      this.loadError = err instanceof Error ? err.message : String(err)
      console.error('[recorder] load failed:', this.loadError)
      return false
    }
  }

  status(): RecorderStatus {
    if (!this.native) {
      return {
        state: 'unavailable',
        available: false,
        reason: this.loadError ?? 'native addon not loaded',
        elapsedMs: 0
      }
    }
    const raw = this.native.getState()
    const state: RecorderState =
      raw === 'recording' || raw === 'paused' || raw === 'stopping' || raw === 'idle'
        ? raw
        : 'idle'
    return {
      state,
      available: true,
      elapsedMs: this.elapsedMs,
      outputPath: this.lastOutputPath
    }
  }

  listScreens(): RecorderDeviceInfo[] {
    this.ensureLoaded()
    return this.native!.listScreens()
  }

  listMics(): RecorderDeviceInfo[] {
    this.ensureLoaded()
    return this.native!.listMics()
  }

  listSystemOutputs(): RecorderDeviceInfo[] {
    this.ensureLoaded()
    return this.native!.listSystemOutputs()
  }

  async start(opts: RecorderStartOptions = {}): Promise<{ outputPath: string }> {
    this.ensureLoaded()
    let enableMic = opts.enableMic !== false
    let enableSystemAudio = opts.enableSystemAudio !== false

    // 无权限则强制关闭对应音源，不允许「选开」
    if (enableMic && !hasMicPermission()) {
      const ok = await requestMicPermission()
      if (!ok) enableMic = false
    }
    if (enableSystemAudio && !hasSystemAudioPermission()) {
      enableSystemAudio = false
    }

    const outputPath = opts.outputPath?.trim() || this.defaultOutputPath()
    this.elapsedMs = 0
    this.lastOutputPath = outputPath
    // napi Option<String> 只接受 undefined / 省略字段，不能传 null
    const config: {
      screenId?: string
      enableMic?: boolean
      enableSystemAudio?: boolean
      micDeviceId?: string
      systemDeviceId?: string
      fps?: number
      quality?: string
      outputPath: string
      ffmpegPath?: string
      region?: { x: number; y: number; width: number; height: number }
    } = {
      enableMic,
      enableSystemAudio,
      fps: opts.fps ?? 30,
      quality: normalizeQuality(opts.quality),
      outputPath
    }
    const screenId = opts.screenId?.trim()
    if (screenId) config.screenId = screenId
    const micDeviceId = opts.micDeviceId?.trim()
    if (micDeviceId) config.micDeviceId = micDeviceId
    const systemDeviceId = opts.systemDeviceId?.trim()
    if (systemDeviceId) config.systemDeviceId = systemDeviceId
    const region = normalizeRegion(opts.region)
    if (region) config.region = region
    const ffmpegPath = resolveFfmpegPath()
    if (ffmpegPath) {
      config.ffmpegPath = ffmpegPath
      console.log('[recorder] ffmpeg:', ffmpegPath)
    } else {
      console.warn('[recorder] ffmpeg: 未找到内置路径，将回退系统 PATH')
    }
    this.native!.startRecord(config)
    return { outputPath }
  }

  stop(): void {
    this.ensureLoaded()
    this.native!.stopRecord()
  }

  /** 软暂停 */
  pause(): void {
    this.ensureLoaded()
    this.native!.pauseRecord()
  }

  /** 继续录制 */
  resume(): void {
    this.ensureLoaded()
    this.native!.resumeRecord()
  }

  /** 录制中实时开关麦克风 */
  setMicEnabled(enabled: boolean): void {
    this.ensureLoaded()
    this.native!.setMicEnabled(enabled)
  }

  /** 录制中实时开关系统声 */
  setSystemAudioEnabled(enabled: boolean): void {
    this.ensureLoaded()
    this.native!.setSystemAudioEnabled(enabled)
  }

  /** 订阅原生事件（返回取消函数） */
  onEvent(listener: EventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** 退出前尽量停录，避免 ffmpeg 半截文件 */
  dispose(): void {
    if (!this.native) return
    try {
      const s = this.native.getState()
      if (s === 'recording' || s === 'paused') {
        this.native.stopRecord()
      }
    } catch (err) {
      console.error('[recorder] dispose stop failed:', err)
    }
  }

  private ensureLoaded(): void {
    if (!this.load()) {
      throw new Error(this.loadError ?? 'recorder native addon unavailable')
    }
  }

  private handleNativeEvent(event: RecorderNativeEvent): void {
    if (event.type === 'progress') {
      this.elapsedMs = event.elapsedMs
    } else if (event.type === 'finished') {
      this.lastOutputPath = event.outputPath
    }
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (err) {
        console.error('[recorder] event listener error:', err)
      }
    }
  }

  private defaultOutputPath(): string {
    const dir = join(app.getPath('userData'), 'recordings')
    const d = new Date()
    const pad = (n: number): string => String(n).padStart(2, '0')
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
    return join(dir, `recording-${stamp}.mp4`)
  }

  private resolveNodeFile(): string {
    const name = nodeFileName()
    const candidates = app.isPackaged
      ? [
          join(process.resourcesPath, 'native', name),
          join(process.resourcesPath, 'native', 'recorder.node')
        ]
      : [
          join(app.getAppPath(), 'native-rs/recorder-napi', name),
          join(__dirname, '../../../../native-rs/recorder-napi', name),
          join(app.getAppPath(), 'native', name),
          join(__dirname, '../../../../native', name),
          join(app.getAppPath(), 'native', 'recorder.node'),
          join(__dirname, '../../../../native', 'recorder.node')
        ]

    for (const p of candidates) {
      if (existsSync(p)) return p
    }
    throw new Error(
      `recorder native binary not found: ${name}（请先执行 npm run build:native，产物在 native/ 或 native-rs/recorder-napi/）`
    )
  }
}

/**
 * 解析 ffmpeg：打包版用 Resources/bin；开发态用 ffmpeg-static；都没有则让 Rust 回退 PATH。
 */
function resolveFfmpegPath(): string | undefined {
  const binName = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  if (app.isPackaged) {
    const packed = join(process.resourcesPath, 'bin', binName)
    return existsSync(packed) ? packed : undefined
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fromPkg = require('ffmpeg-static') as string | null
    if (fromPkg && existsSync(fromPkg)) return fromPkg
  } catch {
    /* 未安装 ffmpeg-static 时忽略 */
  }
  return undefined
}

function nodeFileName(): string {
  if (platform === 'darwin' && arch === 'arm64') return 'recorder.darwin-arm64.node'
  if (platform === 'darwin' && arch === 'x64') return 'recorder.darwin-x64.node'
  if (platform === 'win32' && arch === 'x64') return 'recorder.win32-x64-msvc.node'
  throw new Error(`unsupported platform for recorder: ${platform}-${arch}`)
}

/** 校验并取整区域；宽高过小则视为未传 */
function normalizeRegion(
  region: RecorderStartOptions['region']
): { x: number; y: number; width: number; height: number } | undefined {
  if (!region) return undefined
  const x = Math.max(0, Math.floor(Number(region.x) || 0))
  const y = Math.max(0, Math.floor(Number(region.y) || 0))
  const width = Math.max(0, Math.floor(Number(region.width) || 0))
  const height = Math.max(0, Math.floor(Number(region.height) || 0))
  if (width < 2 || height < 2) return undefined
  return { x, y, width, height }
}

/** 清晰度归一：非法则原画 */
function normalizeQuality(q: RecorderStartOptions['quality']): 'original' | 'ultra' | 'smooth' {
  if (q === 'ultra' || q === 'smooth' || q === 'original') return q
  return 'original'
}
