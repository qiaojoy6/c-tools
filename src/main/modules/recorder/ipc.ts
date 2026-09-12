import { BrowserWindow, ipcMain } from 'electron'
import type {
  RecorderSelectConfirm,
  RecorderStartOptions,
  RecorderVideoQuality
} from '@shared/modules/recorder'
import type { RecorderHost } from './host'
import type { RecorderSelectSession } from './session'
import {
  getAudioPermissions,
  getMicAccessStatus,
  hasMicPermission,
  hasSystemAudioPermission,
  openMicSettings,
  openSystemAudioSettings,
  requestMicPermission
} from './permission'

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
 * | recorder:audio-permissions | 麦/系统声权限快照 |
 * | recorder:request-mic-permission | 申请麦克风 |
 * | recorder:open-mic-settings | 打开麦克风系统设置 |
 * | recorder:open-system-audio-settings | 打开系统声相关设置 |
 * | recorder:start           | 开始录制（可含 region） |
 * | recorder:pause           | 软暂停 |
 * | recorder:resume          | 继续录制 |
 * | recorder:set-mic-enabled | 录制中开关麦克风（开时校验权限） |
 * | recorder:set-system-audio-enabled | 录制中开关系统声（开时校验权限） |
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

  ipcMain.handle('recorder:audio-permissions', () => getAudioPermissions())

  /** 无权限去设置前：先关框选/全屏选屏，否则置顶遮罩挡系统设置 */
  async function dismissSelectUiForSettings(): Promise<void> {
    if (!select?.isActive) return
    try {
      await select.cancelAsync()
      await new Promise<void>((r) => setTimeout(r, 100))
    } catch (err) {
      console.warn('[recorder] dismiss select before settings failed:', err)
    }
  }

  ipcMain.handle('recorder:request-mic-permission', async () => {
    if (hasMicPermission()) {
      return { granted: true, ...getAudioPermissions() }
    }
    // 未决定：先弹系统授权，不直接进设置
    if (getMicAccessStatus() === 'not-determined') {
      const granted = await requestMicPermission()
      if (granted) return { granted: true, ...getAudioPermissions() }
    }
    // 已拒绝或未通过：关框选后直接打开系统设置
    await dismissSelectUiForSettings()
    await openMicSettings()
    return { granted: hasMicPermission(), ...getAudioPermissions() }
  })

  ipcMain.handle('recorder:open-mic-settings', async () => {
    await dismissSelectUiForSettings()
    await openMicSettings()
    return true
  })

  ipcMain.handle('recorder:open-system-audio-settings', async () => {
    if (hasSystemAudioPermission()) return true
    await dismissSelectUiForSettings()
    await openSystemAudioSettings()
    return true
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

  ipcMain.handle('recorder:set-mic-enabled', async (_e, enabled: boolean) => {
    try {
      const on = enabled === true
      if (on && !hasMicPermission()) {
        if (getMicAccessStatus() === 'not-determined') {
          const granted = await requestMicPermission()
          if (granted) {
            host.setMicEnabled(true)
            deps?.persistAudioPrefs?.({ enableMic: true })
            return true
          }
        }
        await openMicSettings()
        return false
      }
      host.setMicEnabled(on)
      deps?.persistAudioPrefs?.({ enableMic: on })
      return true
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : String(err))
    }
  })

  ipcMain.handle('recorder:set-system-audio-enabled', async (_e, enabled: boolean) => {
    try {
      const on = enabled === true
      if (on && !hasSystemAudioPermission()) {
        await openSystemAudioSettings()
        return false
      }
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
      const enableMic = payload.enableMic !== false && hasMicPermission()
      const enableSystemAudio =
        payload.enableSystemAudio !== false && hasSystemAudioPermission()
      deps?.persistRecorderPrefs?.({
        enableMic,
        enableSystemAudio,
        quality: payload.quality,
        micDeviceId: payload.micDeviceId?.trim() || null
      })
      return select.confirm({
        ...payload,
        enableMic,
        enableSystemAudio
      })
    }
  )
}
