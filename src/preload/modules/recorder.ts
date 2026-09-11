import { ipcRenderer } from 'electron'
import type {
  RecorderDeviceInfo,
  RecorderNativeEvent,
  RecorderStartOptions,
  RecorderStatus
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
  stop: (): Promise<boolean> => ipcRenderer.invoke('recorder:stop'),
  onEvent: (callback: (event: RecorderNativeEvent) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, event: RecorderNativeEvent): void =>
      callback(event)
    ipcRenderer.on('recorder:event', listener)
    return () => ipcRenderer.removeListener('recorder:event', listener)
  }
}

export type RecorderApi = typeof recorderApi
