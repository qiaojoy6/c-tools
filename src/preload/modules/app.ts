import { ipcRenderer } from 'electron'
import type { AppConfig, ConfigPatch, ConfigUpdateResult } from '@shared/types'

/**
 * 通用 bridge（对应 main/modules/core/ipc.ts）
 * invoke = 请求响应；send = 单向；on* = 订阅主进程推送，返回取消函数
 */
export const appApi = {
  /** config:get */
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke('config:get'),
  /** config:update */
  updateConfig: (patch: ConfigPatch): Promise<ConfigUpdateResult> =>
    ipcRenderer.invoke('config:update', patch),

  /** shortcuts:suspend — 录制快捷键前调用 */
  suspendShortcuts: (): Promise<boolean> => ipcRenderer.invoke('shortcuts:suspend'),
  /** shortcuts:resume — 录制结束/取消/关设置窗时调用 */
  resumeShortcuts: (): Promise<boolean> => ipcRenderer.invoke('shortcuts:resume'),

  /** panel:hide */
  hidePanel: (): void => ipcRenderer.send('panel:hide'),
  /** settings:open */
  openSettings: (): void => ipcRenderer.send('settings:open'),

  /** 订阅 panel:shown（浮层/面板每次显示时刷新列表、重置搜索等） */
  onPanelShown: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('panel:shown', listener)
    return () => ipcRenderer.removeListener('panel:shown', listener)
  },
  /** 订阅 settings:shown（设置窗再次打开时重新拉配置） */
  onSettingsShown: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('settings:shown', listener)
    return () => ipcRenderer.removeListener('settings:shown', listener)
  }
}

export type AppApi = typeof appApi
