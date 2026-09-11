import { BrowserWindow, ipcMain } from 'electron'
import type { RecorderStartOptions } from '../../../shared/modules/recorder'
import type { RecorderHost } from './host'

/**
 * 录屏 IPC
 *
 * | Channel           | 说明 |
 * |-------------------|------|
 * | recorder:status   | 当前状态 |
 * | recorder:screens  | 枚举显示器 |
 * | recorder:mics     | 枚举麦克风 |
 * | recorder:systemOutputs | 枚举系统声输出 |
 * | recorder:start    | 开始录制（默认可含麦克风+系统声） |
 * | recorder:stop     | 停止录制 |
 * | recorder:event    | 主→渲 推送事件 |
 */
export function registerRecorderIpc(host: RecorderHost): void {
  host.load()

  host.onEvent((event) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('recorder:event', event)
    }
  })

  ipcMain.handle('recorder:status', () => host.status())

  ipcMain.handle('recorder:screens', () => {
    try {
      return host.listScreens()
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : String(err))
    }
  })

  ipcMain.handle('recorder:mics', () => {
    try {
      return host.listMics()
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : String(err))
    }
  })

  ipcMain.handle('recorder:systemOutputs', () => {
    try {
      return host.listSystemOutputs()
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : String(err))
    }
  })

  ipcMain.handle('recorder:start', async (_e, opts?: RecorderStartOptions) => {
    try {
      return await host.start(opts && typeof opts === 'object' ? opts : {})
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : String(err))
    }
  })

  ipcMain.handle('recorder:stop', () => {
    try {
      host.stop()
      return true
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : String(err))
    }
  })
}
