import { ipcRenderer } from 'electron'
import type { HostsAuthSession, HostsMutationResult, HostsScheme } from '@shared/types'

/** 读取系统 hosts 预览结果 */
export type HostsSystemReadResult =
  | { ok: true; content: string; path: string }
  | { ok: false; error: string }

/**
 * Hosts bridge（对应 main/modules/hosts/ipc.ts）
 */
export const hostsApi = {
  list: (): Promise<HostsScheme[]> => ipcRenderer.invoke('hosts:list'),
  add: (name: string): Promise<HostsMutationResult> => ipcRenderer.invoke('hosts:add', name),
  rename: (id: string, name: string): Promise<HostsMutationResult> =>
    ipcRenderer.invoke('hosts:rename', id, name),
  setContent: (id: string, content: string): Promise<HostsMutationResult> =>
    ipcRenderer.invoke('hosts:setContent', id, content),
  setEnabled: (id: string, enabled: boolean): Promise<HostsMutationResult> =>
    ipcRenderer.invoke('hosts:setEnabled', id, enabled),
  remove: (id: string): Promise<HostsMutationResult> => ipcRenderer.invoke('hosts:remove', id),
  reorder: (ids: string[]): Promise<HostsMutationResult> =>
    ipcRenderer.invoke('hosts:reorder', ids),
  removeAllFromSystem: (): Promise<HostsMutationResult> =>
    ipcRenderer.invoke('hosts:removeAllFromSystem'),
  readSystem: (): Promise<HostsSystemReadResult> => ipcRenderer.invoke('hosts:readSystem'),
  getAuthSession: (): Promise<HostsAuthSession> => ipcRenderer.invoke('hosts:getAuthSession'),

  onUpdated: (callback: (schemes: HostsScheme[]) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, schemes: HostsScheme[]): void =>
      callback(schemes)
    ipcRenderer.on('hosts:updated', listener)
    return () => ipcRenderer.removeListener('hosts:updated', listener)
  },

  onAuthSession: (callback: (info: HostsAuthSession) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, info: HostsAuthSession): void =>
      callback(info)
    ipcRenderer.on('hosts:authSession', listener)
    return () => ipcRenderer.removeListener('hosts:authSession', listener)
  }
}

export type HostsApi = typeof hostsApi
