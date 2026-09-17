import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type {
  QuickFolderInput,
  QuickFolderItem,
  QuickFolderMutationResult
} from '@shared/types'
import type { WindowManager } from '../core/windows'
import { QuickFoldersStore } from './store'

export interface QuickFoldersIpcDeps {
  store: QuickFoldersStore
  windows: WindowManager
}

/**
 * 快捷文件夹 IPC
 *
 * | Channel                    | 说明 |
 * |----------------------------|------|
 * | quickFolders:list          | 拉取列表（含 valid） |
 * | quickFolders:add           | 添加（路径须存在且唯一） |
 * | quickFolders:update        | 改备注 / 路径 |
 * | quickFolders:remove        | 删除 |
 * | quickFolders:reorder       | 拖拽后重排 |
 * | quickFolders:pickDirectory | 系统选目录（选中时抑制浮层失焦隐藏） |
 * | quickFolders:open          | shell.openPath 打开目录 |
 *
 * 主→渲染：quickFolders:updated
 */
export function registerQuickFoldersIpc(deps: QuickFoldersIpcDeps): void {
  const { store, windows } = deps

  store.setOnUpdate((items) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('quickFolders:updated', items)
    }
  })

  ipcMain.handle('quickFolders:list', (): QuickFolderItem[] => store.list())

  ipcMain.handle(
    'quickFolders:add',
    (_e, input: QuickFolderInput): QuickFolderMutationResult => {
      const path = typeof input?.path === 'string' ? input.path : ''
      const note = typeof input?.note === 'string' ? input.note : ''
      return store.add(path, note)
    }
  )

  ipcMain.handle(
    'quickFolders:update',
    (
      _e,
      id: string,
      patch: { path?: string; note?: string }
    ): QuickFolderMutationResult => {
      if (typeof id !== 'string' || !id) return { ok: false, error: '无效 id' }
      const record = store.get(id)
      if (!record) return { ok: false, error: '记录不存在' }
      // 失效项仅可删除，禁止 update
      const items = store.list()
      const item = items.find((i) => i.id === id)
      if (item && !item.valid) return { ok: false, error: '路径无效，只能删除' }
      return store.update(id, patch ?? {})
    }
  )

  ipcMain.handle('quickFolders:remove', (_e, id: string): boolean => {
    if (typeof id !== 'string' || !id) return false
    return store.remove(id)
  })

  ipcMain.handle('quickFolders:reorder', (_e, ids: string[]): boolean => {
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) return false
    return store.reorder(ids)
  })

  ipcMain.handle('quickFolders:pickDirectory', async (): Promise<string | null> => {
    const float = windows.quickFolders.browserWindow
    const parent =
      float && !float.isDestroyed() && float.isVisible()
        ? float
        : BrowserWindow.getFocusedWindow()

    const opts: Electron.OpenDialogOptions = {
      title: '选择文件夹',
      properties: ['openDirectory', 'createDirectory']
    }
    windows.quickFolders.beginSuppressBlurHide()
    try {
      const result = parent
        ? await dialog.showOpenDialog(parent, opts)
        : await dialog.showOpenDialog(opts)
      if (result.canceled || !result.filePaths[0]) return null
      return result.filePaths[0]
    } finally {
      windows.quickFolders.endSuppressBlurHide()
    }
  })

  ipcMain.handle('quickFolders:open', async (_e, id: string): Promise<boolean> => {
    if (typeof id !== 'string' || !id) return false
    const record = store.get(id)
    if (!record) return false
    const items = store.list()
    const item = items.find((i) => i.id === id)
    if (!item?.valid) return false
    const err = await shell.openPath(record.path)
    if (err !== '') return false
    // 独立浮层：打开后关浮层，保持 Finder/资源管理器在前，不抬功能面板
    if (windows.quickFolders.isVisible()) {
      await windows.dismissFloatingKeepFrontmost()
    }
    return true
  })
}
