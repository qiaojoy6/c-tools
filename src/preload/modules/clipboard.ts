import { ipcRenderer } from 'electron'
import type { ClipRecord } from '@shared/types'

/**
 * 剪贴板 bridge（对应 main/modules/clipboard/ipc.ts）
 */
export const clipboardApi = {
  /** history:list */
  listHistory: (): Promise<ClipRecord[]> => ipcRenderer.invoke('history:list'),
  /** history:remove */
  removeHistory: (id: string): Promise<boolean> => ipcRenderer.invoke('history:remove', id),
  /** history:clear — 仅清空历史，不影响收藏 */
  clearHistory: (): Promise<boolean> => ipcRenderer.invoke('history:clear'),

  /** favorite:list */
  listFavorites: (): Promise<ClipRecord[]> => ipcRenderer.invoke('favorite:list'),
  /** favorite:add — 按历史 id 拷贝到收藏 */
  addFavorite: (historyId: string): Promise<boolean> =>
    ipcRenderer.invoke('favorite:add', historyId),
  /** favorite:remove — 取消收藏即删除 */
  removeFavorite: (id: string): Promise<boolean> => ipcRenderer.invoke('favorite:remove', id),

  /** clip:paste — 按 id 列表顺序粘贴到原焦点应用（历史或收藏） */
  pasteItems: (ids: string[]): Promise<boolean> => ipcRenderer.invoke('clip:paste', ids),

  /** 订阅 history:updated */
  onHistoryUpdated: (callback: (records: ClipRecord[]) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, records: ClipRecord[]): void =>
      callback(records)
    ipcRenderer.on('history:updated', listener)
    return () => ipcRenderer.removeListener('history:updated', listener)
  },

  /** 订阅 favorite:updated */
  onFavoritesUpdated: (callback: (records: ClipRecord[]) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, records: ClipRecord[]): void =>
      callback(records)
    ipcRenderer.on('favorite:updated', listener)
    return () => ipcRenderer.removeListener('favorite:updated', listener)
  }
}

export type ClipboardApi = typeof clipboardApi
