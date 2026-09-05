import { BrowserWindow, ipcMain } from 'electron'
import type { LogLevel, LogWritePayload } from '@shared/types'

const LEVELS = new Set<LogLevel>(['debug', 'info', 'warn', 'error'])

/** 注册渲染进程日志 IPC：log:write → 主进程终端 */
export function registerLogIpc(): void {
  ipcMain.on('log:write', (event, payload: LogWritePayload) => {
    if (!payload || !LEVELS.has(payload.level) || !Array.isArray(payload.messages)) return

    const win = BrowserWindow.fromWebContents(event.sender)
    const title = win && !win.isDestroyed() ? win.getTitle() || 'window' : 'renderer'
    const time = payload.ts ? new Date(payload.ts).toLocaleTimeString() : ''
    const prefix = time ? `[renderer:${title} ${time}]` : `[renderer:${title}]`

    const printer =
      payload.level === 'debug'
        ? console.debug
        : payload.level === 'info'
          ? console.info
          : payload.level === 'warn'
            ? console.warn
            : console.error

    printer(prefix, ...payload.messages)
  })
}
