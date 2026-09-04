import { ipcMain } from 'electron'
import type { ClipRecord } from '@shared/types'
import type { WindowManager } from '../core/windows'
import type { FavoritesManager } from './favorites'
import type { HistoryManager } from './history'
import type { PasteService } from './paste'

export interface ClipboardIpcDeps {
  history: HistoryManager
  favorites: FavoritesManager
  paste: PasteService
  windows: WindowManager
}

/**
 * 剪贴板模块 IPC（主进程 handle）
 *
 * | Channel           | 方向           | 说明 |
 * |-------------------|----------------|------|
 * | history:list      | 渲染→主 invoke | 拉取全部历史 |
 * | history:remove    | 渲染→主 invoke | 删除单条历史 |
 * | history:clear     | 渲染→主 invoke | 清空历史（不影响收藏） |
 * | favorite:list     | 渲染→主 invoke | 拉取全部收藏 |
 * | favorite:add      | 渲染→主 invoke | 从历史 id 拷贝到收藏 |
 * | favorite:remove   | 渲染→主 invoke | 取消收藏（删除） |
 * | clip:paste        | 渲染→主 invoke | 恢复焦点后模拟粘贴；成功返回 true |
 *
 * 主→渲染推送：
 * history:updated / favorite:updated
 */
export function registerClipboardIpc(deps: ClipboardIpcDeps): void {
  const { history, favorites, paste, windows } = deps

  ipcMain.handle('history:list', (): ClipRecord[] => history.getAll())

  ipcMain.handle('history:remove', (_e, id: string): boolean => {
    history.remove(id)
    return true
  })

  ipcMain.handle('history:clear', (): boolean => {
    history.clear()
    return true
  })

  ipcMain.handle('favorite:list', (): ClipRecord[] => favorites.getAll())

  /** 按历史 id 拷贝到收藏；已存在相同内容则 false */
  ipcMain.handle('favorite:add', (_e, historyId: string): boolean => {
    const source = history.get(historyId)
    if (!source) return false
    return favorites.addFrom(source)
  })

  ipcMain.handle('favorite:remove', (_e, id: string): boolean => {
    favorites.remove(id)
    return true
  })

  /**
   * 粘贴：历史或收藏均可；仅历史 id 会 touch 置顶
   */
  ipcMain.handle('clip:paste', async (_e, ids: string[]): Promise<boolean> => {
    const records = (ids ?? [])
      .map((id) => history.get(id) ?? favorites.get(id))
      .filter((r): r is ClipRecord => Boolean(r))
    if (!records.length) return false

    const historyIds = records.filter((r) => history.get(r.id)).map((r) => r.id)
    if (historyIds.length) history.touch(historyIds)

    const restored = await windows.restorePreviousFocus()
    if (!restored) return false
    return paste.paste(records)
  })
}
