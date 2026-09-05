import { ipcRenderer } from 'electron'
import type { LogLevel, LogWritePayload } from '@shared/types'

/**
 * 日志 bridge（对应 main/modules/core/logIpc.ts）
 * 合入 window.api；完整 window.logApi 由渲染进程 install（contextBridge 属性只读，不能覆盖）。
 */
export const logBridgeApi = {
  /** log:write — 主进程终端输出（仅已格式化字符串） */
  logWrite: (level: LogLevel, messages: string[]): void => {
    const payload: LogWritePayload = {
      level,
      messages: Array.isArray(messages) ? messages.map(String) : [String(messages)],
      ts: Date.now()
    }
    ipcRenderer.send('log:write', payload)
  }
}

export type LogBridgeApi = typeof logBridgeApi
