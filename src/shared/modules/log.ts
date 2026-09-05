/** 渲染进程日志相关类型 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** preload → 主进程：仅传已格式化的字符串，避免循环引用无法过 contextBridge */
export interface LogWritePayload {
  level: LogLevel
  messages: string[]
  /** 毫秒时间戳 */
  ts: number
}

/**
 * 渲染侧日志 API（`window.logApi`）
 * - `write`：preload 提供，只收字符串
 * - `debug/info/warn/error`：由渲染工具安装，可打任意类型（含循环引用）
 */
export interface LogApi {
  write: (level: LogLevel, messages: string[]) => void
  debug: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}
