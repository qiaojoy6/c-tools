import { BrowserWindow, ipcMain } from 'electron'
import type {
  RecorderSelectConfirm,
  RecorderStartOptions,
  RecorderVideoQuality
} from '../../../shared/modules/recorder'
import type { RecorderHost } from './host'
import type { RecorderSelectSession } from './session'

export interface RecorderIpcDeps {
  /** 录制中切换麦/系统声时写回配置 */
  persistAudioPrefs?: (prefs: {
    enableMic?: boolean
    enableSystemAudio?: boolean
  }) => void
  /** 开录确认时写回清晰度等 */
  persistRecorderPrefs?: (prefs: {
    enableMic?: boolean
    enableSystemAudio?: boolean
    quality?: RecorderVideoQuality
    micDeviceId?: string | null
  }) => void
}

/**
 * 录屏 IPC
 *
 * | Channel                  | 说明 |
 * |--------------------------|------|
 * | recorder:status          | 当前状态 |
 * | recorder:screens         | 枚举显示器 |
 * | recorder:mics            | 枚举麦克风 |
 * | recorder:systemOutputs   | 枚举系统声输出 |
 * | recorder:start           | 开始录制（可含 region） |
 * | recorder:pause           | 软暂停 |
 * | recorder:resume          | 继续录制 |
 * | recorder:set-mic-enabled | 录制中开关麦克风 |
 * | recorder:set-system-audio-enabled | 录制中开关系统声 |
 * | recorder:stop            | 停止录制 |
 * | recorder:select-cancel   | 取消框选遮罩 |
 * | recorder:select-confirm  | 确认框选并开始录制 |
 * | recorder:fullscreen-init | 主→渲 全屏选屏弹窗初始化 |
 * | recorder:fullscreen-ready| 渲→主 选屏弹窗就绪 |
 * | recorder:fullscreen-confirm | 确认全屏选屏 |
 * | recorder:fullscreen-cancel  | 取消全屏选屏 |
 * | recorder:event           | 主→渲 推送事件 |
 * | recorder:select-init     | 主→渲 框选会话初始化 |
 */
export function registerRecorderIpc(
  host: RecorderHost,
  select?: RecorderSelectSession,
  deps?: RecorderIpcDeps
): void {
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

  ipcMain.handle('recorder:pause', () => {
    try {
      host.pause()
      return true
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : String(err))
    }
  })

  ipcMain.handle('recorder:resume', () => {
    try {
      host.resume()
      return true
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : String(err))
    }
  })

  ipcMain.handle('recorder:set-mic-enabled', (_e, enabled: boolean) => {
    try {
      const on = enabled === true
      host.setMicEnabled(on)
      deps?.persistAudioPrefs?.({ enableMic: on })
      return true
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : String(err))
    }
  })

  ipcMain.handle('recorder:set-system-audio-enabled', (_e, enabled: boolean) => {
    try {
      const on = enabled === true
      host.setSystemAudioEnabled(on)
      deps?.persistAudioPrefs?.({ enableSystemAudio: on })
      return true
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : String(err))
    }
  })

  ipcMain.handle('recorder:stop', () => {
    try {
      if (select) {
        select.stopRecording({ promptSave: true })
      } else {
        host.stop()
      }
      return true
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : String(err))
    }
  })

  if (!select) return

  ipcMain.handle('recorder:select-cancel', async (): Promise<boolean> => {
    await select.cancelAsync()
    return true
  })

  ipcMain.handle(
    'recorder:select-confirm',
    async (_e, payload: RecorderSelectConfirm): Promise<{ outputPath: string } | null> => {
      if (!payload || typeof payload !== 'object') return null
      deps?.persistRecorderPrefs?.({
        enableMic: payload.enableMic !== false,
        enableSystemAudio: payload.enableSystemAudio !== false,
        quality: payload.quality,
        micDeviceId: payload.micDeviceId?.trim() || null
      })
      return select.confirm(payload)
    }
  )
}
