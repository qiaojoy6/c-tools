import { ipcRenderer } from 'electron'
import type {
  QuickFolderInput,
  QuickFolderItem,
  QuickFolderMutationResult
} from '@shared/types'

/**
 * 快捷文件夹 bridge（对应 main/modules/quickFolders/ipc.ts）
 */
export const quickFoldersApi = {
  list: (): Promise<QuickFolderItem[]> => ipcRenderer.invoke('quickFolders:list'),
  add: (input: QuickFolderInput): Promise<QuickFolderMutationResult> =>
    ipcRenderer.invoke('quickFolders:add', input),
  update: (
    id: string,
    patch: { path?: string; note?: string }
  ): Promise<QuickFolderMutationResult> => ipcRenderer.invoke('quickFolders:update', id, patch),
  remove: (id: string): Promise<boolean> => ipcRenderer.invoke('quickFolders:remove', id),
  reorder: (ids: string[]): Promise<boolean> => ipcRenderer.invoke('quickFolders:reorder', ids),
  pickDirectory: (): Promise<string | null> => ipcRenderer.invoke('quickFolders:pickDirectory'),
  open: (id: string): Promise<boolean> => ipcRenderer.invoke('quickFolders:open', id),

  onUpdated: (callback: (items: QuickFolderItem[]) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, items: QuickFolderItem[]): void =>
      callback(items)
    ipcRenderer.on('quickFolders:updated', listener)
    return () => ipcRenderer.removeListener('quickFolders:updated', listener)
  }
}

export type QuickFoldersApi = typeof quickFoldersApi
