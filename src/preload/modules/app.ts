import { ipcRenderer } from 'electron'
import type { AppConfig, ConfigPatch, ConfigUpdateResult } from '../../shared/types'

/** 通用应用 bridge：配置读写与窗口控制 */
export const appApi = {
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke('config:get'),
  updateConfig: (patch: ConfigPatch): Promise<ConfigUpdateResult> =>
    ipcRenderer.invoke('config:update', patch),

  /** 录制快捷键时暂停/恢复全局快捷键 */
  suspendShortcuts: (): Promise<boolean> => ipcRenderer.invoke('shortcuts:suspend'),
  resumeShortcuts: (): Promise<boolean> => ipcRenderer.invoke('shortcuts:resume'),

  hidePanel: (): void => ipcRenderer.send('panel:hide'),
  openSettings: (): void => ipcRenderer.send('settings:open'),

  onPanelShown: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('panel:shown', listener)
    return () => ipcRenderer.removeListener('panel:shown', listener)
  },
  onSettingsShown: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('settings:shown', listener)
    return () => ipcRenderer.removeListener('settings:shown', listener)
  }
}

export type AppApi = typeof appApi
