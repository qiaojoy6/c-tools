import { ipcRenderer } from 'electron'
import type {
  RecorderDeviceInfo,
  RecorderFullscreenConfirm,
  RecorderFullscreenInit,
  RecorderNativeEvent,
  RecorderOverlayInit,
  RecorderSelectConfirm,
  RecorderStartOptions,
  RecorderStatus,
  RecorderWindowInfo
} from '@shared/types'

/**
 * 录屏 bridge
 */
export const recorderApi = {
  status: (): Promise<RecorderStatus> => ipcRenderer.invoke('recorder:status'),
  listScreens: (): Promise<RecorderDeviceInfo[]> => ipcRenderer.invoke('recorder:screens'),
  listMics: (): Promise<RecorderDeviceInfo[]> => ipcRenderer.invoke('recorder:mics'),
  listSystemOutputs: (): Promise<RecorderDeviceInfo[]> =>
    ipcRenderer.invoke('recorder:systemOutputs'),
  start: (opts?: RecorderStartOptions): Promise<{ outputPath: string }> =>
    ipcRenderer.invoke('recorder:start', opts),
  pause: (): Promise<boolean> => ipcRenderer.invoke('recorder:pause'),
  resume: (): Promise<boolean> => ipcRenderer.invoke('recorder:resume'),
  /** 录制中实时开关麦克风 */
  setMicEnabled: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke('recorder:set-mic-enabled', enabled),
  /** 录制中实时开关系统声 */
  setSystemAudioEnabled: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke('recorder:set-system-audio-enabled', enabled),
  stop: (): Promise<boolean> => ipcRenderer.invoke('recorder:stop'),
  /** 取消框选遮罩 */
  cancelSelect: (): Promise<boolean> => ipcRenderer.invoke('recorder:select-cancel'),
  /** 确认框选并开始录制 */
  confirmSelect: (
    payload: RecorderSelectConfirm
  ): Promise<{ outputPath: string } | null> =>
    ipcRenderer.invoke('recorder:select-confirm', payload),
  overlayReady: (displayId: number): void => {
    ipcRenderer.send('recorder:overlay-ready', displayId)
  },
  onSelectInit: (callback: (init: RecorderOverlayInit) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, init: RecorderOverlayInit): void =>
      callback(init)
    ipcRenderer.on('recorder:select-init', listener)
    return () => ipcRenderer.removeListener('recorder:select-init', listener)
  },
  onSelectWindows: (
    callback: (payload: {
      windows: RecorderWindowInfo[]
      windowPickAvailable: boolean
    }) => void
  ): (() => void) => {
    const listener = (
      _e: Electron.IpcRendererEvent,
      payload: { windows: RecorderWindowInfo[]; windowPickAvailable: boolean }
    ): void => callback(payload)
    ipcRenderer.on('recorder:select-windows', listener)
    return () => ipcRenderer.removeListener('recorder:select-windows', listener)
  },
  /** 全屏选屏弹窗已就绪 */
  fullscreenReady: (): void => {
    ipcRenderer.send('recorder:fullscreen-ready')
  },
  /** 确认全屏选屏并开始录制 */
  confirmFullscreen: (payload: RecorderFullscreenConfirm): Promise<boolean> =>
    ipcRenderer.invoke('recorder:fullscreen-confirm', payload),
  /** 取消全屏选屏弹窗 */
  cancelFullscreen: (): Promise<boolean> => ipcRenderer.invoke('recorder:fullscreen-cancel'),
  onFullscreenInit: (callback: (init: RecorderFullscreenInit) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, init: RecorderFullscreenInit): void =>
      callback(init)
    ipcRenderer.on('recorder:fullscreen-init', listener)
    return () => ipcRenderer.removeListener('recorder:fullscreen-init', listener)
  },
  onEvent: (callback: (event: RecorderNativeEvent) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, event: RecorderNativeEvent): void =>
      callback(event)
    ipcRenderer.on('recorder:event', listener)
    return () => ipcRenderer.removeListener('recorder:event', listener)
  },
  /** 录制条：停止 / 暂停 / 继续 */
  borderStop: (): Promise<boolean> => ipcRenderer.invoke('recorder:border-stop'),
  borderPause: (): Promise<boolean> => ipcRenderer.invoke('recorder:border-pause'),
  borderResume: (): Promise<boolean> => ipcRenderer.invoke('recorder:border-resume'),
  onBorderTick: (
    callback: (payload: { elapsedMs: number; paused: boolean }) => void
  ): (() => void) => {
    const listener = (
      _e: Electron.IpcRendererEvent,
      payload: { elapsedMs: number; paused: boolean }
    ): void => callback(payload)
    ipcRenderer.on('recorder:border-tick', listener)
    return () => ipcRenderer.removeListener('recorder:border-tick', listener)
  },
  onBorderState: (
    callback: (payload: {
      paused: boolean
      enableMic?: boolean
      enableSystemAudio?: boolean
    }) => void
  ): (() => void) => {
    const listener = (
      _e: Electron.IpcRendererEvent,
      payload: { paused: boolean; enableMic?: boolean; enableSystemAudio?: boolean }
    ): void => callback(payload)
    ipcRenderer.on('recorder:border-state', listener)
    return () => ipcRenderer.removeListener('recorder:border-state', listener)
  },
  /** 录制悬浮条：悬停时关闭点击穿透 */
  setChromeIgnoreMouse: (ignore: boolean): void => {
    ipcRenderer.send('recorder:chrome-ignore-mouse', ignore)
  },
  /** 录制悬浮条：拖动中更新位置 */
  moveFloat: (payload: { x: number; y: number }): void => {
    ipcRenderer.send('recorder:float-move', payload)
  }
}

export type RecorderApi = typeof recorderApi
