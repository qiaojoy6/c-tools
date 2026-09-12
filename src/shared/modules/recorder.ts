/** ============ 录屏模块共享类型（与 recorder-napi 对齐） ============ */

/** 视频清晰度：原画 / 超清 / 流畅（只影响画面，音质不降） */
export type RecorderVideoQuality = 'original' | 'ultra' | 'smooth'

export interface RecorderDeviceInfo {
  id: string
  name: string
  deviceType: string
  width: number
  height: number
  isPrimary: boolean
}

export interface RecorderRegion {
  /** 相对目标显示器左上角，单位：物理像素（与 listScreens 宽高同坐标系） */
  x: number
  y: number
  width: number
  height: number
}

/** 屏幕矩形（DIP，与 Electron display.bounds 同系） */
export interface RecorderDipRect {
  x: number
  y: number
  width: number
  height: number
}

/** 下发给某屏录屏框选遮罩的会话数据 */
export interface RecorderOverlayInit {
  sessionId: string
  displayId: number
  bounds: RecorderDipRect
  workArea: RecorderDipRect
  /**
   * 窗口客户区 (0,0) 相对 bounds 原点的偏移。
   * macOS 隐藏菜单栏后通常为 0；未隐藏时可能有菜单栏高度。
   */
  viewportOffset: { x: number; y: number }
  scaleFactor: number
  /** 匹配到的 xcap 显示器 id，开始录制时原样回传 */
  screenId: string
  /** 本屏可点选应用窗（本屏本地 DIP）；异步补全 */
  windows: RecorderWindowInfo[]
  /** windows 为空时仅框选 */
  windowPickAvailable: boolean
}

/** 框选页可点选的顶层窗口（本屏本地 DIP） */
export interface RecorderWindowInfo {
  id: string
  title: string
  bounds: RecorderDipRect
}

/** 框选页确认开始：区域为相对本屏 bounds 的 DIP，主进程换算物理像素 */
export interface RecorderSelectConfirm {
  displayId: number
  screenId: string
  regionDip: RecorderDipRect
  scaleFactor: number
  enableMic: boolean
  enableSystemAudio: boolean
  /** 麦克风设备 id（Rust listMics）；省略则内核默认 */
  micDeviceId?: string
  /** 帧率 */
  fps: number
  /** 视频清晰度；省略则原画 */
  quality?: RecorderVideoQuality
}

/** 全屏选屏弹窗初始化（屏幕列表来自 Rust xcap） */
export interface RecorderFullscreenInit {
  sessionId: string
  screens: RecorderDeviceInfo[]
}

/** 全屏选屏弹窗确认：不传 region，整屏录制 */
export interface RecorderFullscreenConfirm {
  screenId: string
  enableMic: boolean
  enableSystemAudio: boolean
  /** 麦克风设备 id（Rust listMics）；省略则内核默认 */
  micDeviceId?: string
  /** 帧率 */
  fps: number
  /** 视频清晰度；省略则原画 */
  quality?: RecorderVideoQuality
}

export interface RecorderStartOptions {
  /** 目标显示器 id；不传则主屏 */
  screenId?: string
  /** 是否录麦克风，默认 true */
  enableMic?: boolean
  /** 是否录系统声音，默认 true */
  enableSystemAudio?: boolean
  /** 麦克风设备 id；不传则系统默认 */
  micDeviceId?: string
  /** 系统输出环回设备 id；不传则默认输出 */
  systemDeviceId?: string
  /** 帧率，默认 30 */
  fps?: number
  /** 视频清晰度：原画 / 超清 / 流畅，默认原画；不影响音质 */
  quality?: RecorderVideoQuality
  /** 输出 MP4 绝对路径；不传则写入 userData/recordings */
  outputPath?: string
  /** 区域录屏；不传则整屏。坐标相对 screenId 对应显示器 */
  region?: RecorderRegion
}

export type RecorderState = 'idle' | 'recording' | 'paused' | 'stopping' | 'unavailable'

export type RecorderNativeEvent =
  | { type: 'stateChanged'; state: Exclude<RecorderState, 'unavailable'> }
  | { type: 'progress'; elapsedMs: number }
  | { type: 'error'; message: string }
  | { type: 'finished'; outputPath: string }

export interface RecorderStatus {
  state: RecorderState
  /** 插件是否已加载 */
  available: boolean
  /** 不可用原因 */
  reason?: string
  elapsedMs: number
  outputPath?: string
}

/** 录屏模块持久化配置（settings.json → recorder） */
export interface RecorderConfig {
  /**
   * 全屏录制悬浮条上次位置（屏幕 DIP）。
   * 区域录屏不记位置，每次按选区计算。
   */
  fullscreenFloatPos: { x: number; y: number } | null
  /** 是否录麦克风 */
  enableMic: boolean
  /** 是否录系统声音 */
  enableSystemAudio: boolean
  /** 上次选用的麦克风设备 id；null 表示未指定（内核默认） */
  micDeviceId: string | null
  /** 视频清晰度 */
  quality: RecorderVideoQuality
}

/** 麦 / 系统声权限快照（选项条与录中开关共用） */
export type RecorderMediaAccessStatus =
  | 'not-determined'
  | 'granted'
  | 'denied'
  | 'restricted'
  | 'unknown'

export interface RecorderAudioPermissions {
  mic: RecorderMediaAccessStatus
  micGranted: boolean
  /** macOS 依赖屏幕录制；Windows 一般为 true */
  systemAudioGranted: boolean
}
