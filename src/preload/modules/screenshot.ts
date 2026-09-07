import { ipcRenderer } from 'electron'
import type { ShotOverlayInit } from '@shared/types'

/**
 * 截屏 bridge
 */
export const screenshotApi = {
  cancel: (): Promise<boolean> => ipcRenderer.invoke('screenshot:cancel'),
  complete: (pngBase64: string): Promise<boolean> =>
    ipcRenderer.invoke('screenshot:complete', pngBase64),
  save: (pngBase64: string): Promise<boolean> =>
    ipcRenderer.invoke('screenshot:save', pngBase64),
  /** 某屏冻结帧 PNG base64（data URL，避免 shotimg 污染 canvas） */
  framePng: (displayId: number): Promise<string | null> =>
    ipcRenderer.invoke('screenshot:frame-png', displayId),
  overlayReady: (displayId: number): void => {
    ipcRenderer.send('screenshot:overlay-ready', displayId)
  },
  onInit: (callback: (init: ShotOverlayInit) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, init: ShotOverlayInit): void =>
      callback(init)
    ipcRenderer.on('screenshot:init', listener)
    return () => ipcRenderer.removeListener('screenshot:init', listener)
  },
  onWindows: (
    callback: (payload: {
      windows: ShotOverlayInit['windows']
      windowPickAvailable: boolean
    }) => void
  ): (() => void) => {
    const listener = (
      _e: Electron.IpcRendererEvent,
      payload: { windows: ShotOverlayInit['windows']; windowPickAvailable: boolean }
    ): void => callback(payload)
    ipcRenderer.on('screenshot:windows', listener)
    return () => ipcRenderer.removeListener('screenshot:windows', listener)
  }
}

export type ScreenshotApi = typeof screenshotApi
