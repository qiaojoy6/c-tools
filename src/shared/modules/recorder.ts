/** ============ 录屏模块共享类型（与 recorder-napi 对齐） ============ */

export interface RecorderDeviceInfo {
  id: string
  name: string
  deviceType: string
  width: number
  height: number
  isPrimary: boolean
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
  /** 输出 MP4 绝对路径；不传则写入 userData/recordings */
  outputPath?: string
}

export type RecorderState = 'idle' | 'recording' | 'stopping' | 'unavailable'

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
