import { ipcRenderer } from 'electron'
import type { AppConfig, ConfigPatch, ConfigUpdateResult } from '../../shared/types'

/** 通用应用 bridge：配置读写与面板控制 */
export const appApi = {
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke('config:get'),
  updateConfig: (patch: ConfigPatch): Promise<ConfigUpdateResult> =>
    ipcRenderer.invoke('config:update', patch),

  /** 录制快捷键时暂停/恢复全局快捷键 */
  suspendShortcuts: (): Promise<boolean> => ipcRenderer.invoke('shortcuts:suspend'),
  resumeShortcuts: (): Promise<boolean> => ipcRenderer.invoke('shortcuts:resume'),

  hidePanel: (): void => ipcRenderer.send('panel:hide'),
  onPanelShown: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('panel:shown', listener)
    return () => ipcRenderer.removeListener('panel:shown', listener)
  },
  onOpenSettings: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('panel:open-settings', listener)
    return () => ipcRenderer.removeListener('panel:open-settings', listener)
  }
}

export type AppApi = typeof appApi
