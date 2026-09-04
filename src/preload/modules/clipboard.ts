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
  /** history:clear */
  clearHistory: (): Promise<boolean> => ipcRenderer.invoke('history:clear'),

  /** clip:paste — 按 id 列表顺序粘贴到原焦点应用 */
  pasteItems: (ids: string[]): Promise<boolean> => ipcRenderer.invoke('clip:paste', ids),

  /** 订阅 history:updated（监听捕获或主进程变更后同步列表） */
  onHistoryUpdated: (callback: (records: ClipRecord[]) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, records: ClipRecord[]): void =>
      callback(records)
    ipcRenderer.on('history:updated', listener)
    return () => ipcRenderer.removeListener('history:updated', listener)
  }
}

export type ClipboardApi = typeof clipboardApi
