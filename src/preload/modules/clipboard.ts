import { ipcRenderer } from 'electron'
import type { ClipRecord } from '../../shared/types'

/** 剪贴板模块 bridge：历史记录管理与粘贴 */
export const clipboardApi = {
  listHistory: (): Promise<ClipRecord[]> => ipcRenderer.invoke('history:list'),
  removeHistory: (id: string): Promise<boolean> => ipcRenderer.invoke('history:remove', id),
  clearHistory: (): Promise<boolean> => ipcRenderer.invoke('history:clear'),

  pasteItems: (ids: string[]): Promise<boolean> => ipcRenderer.invoke('clip:paste', ids),

  onHistoryUpdated: (callback: (records: ClipRecord[]) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, records: ClipRecord[]): void =>
      callback(records)
    ipcRenderer.on('history:updated', listener)
    return () => ipcRenderer.removeListener('history:updated', listener)
  }
}

export type ClipboardApi = typeof clipboardApi
