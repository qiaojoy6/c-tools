import { ipcMain, Notification } from 'electron'
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
 * | clip:paste        | 渲染→主 invoke | 先写入系统剪贴板，再恢复焦点并模拟粘贴 |
 *
 * 主→渲染推送：
 * history:updated / favorite:updated
 */
/** 本进程内「已复制请手动粘贴」只提示一次，避免每次 Enter 刷屏 */
let manualPasteHintShown = false

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
   * 粘贴：历史或收藏均可；仅历史 id 会 touch 置顶。
   * 必须先写入系统剪贴板，再关窗/切焦点——否则自动粘贴失败时手动 Ctrl+V 也是空的。
   */
  ipcMain.handle('clip:paste', async (_e, ids: string[]): Promise<boolean> => {
    const records = (ids ?? [])
      .map((id) => history.get(id) ?? favorites.get(id))
      .filter((r): r is ClipRecord => Boolean(r))
    if (!records.length) return false

    const historyIds = records.filter((r) => history.get(r.id)).map((r) => r.id)
    if (historyIds.length) history.touch(historyIds)

    // 先落到系统剪贴板（单条或多条的第一条），保证手动 Ctrl+V 可用
    paste.copy(records[0]!)

    // 无辅助功能：启动时已提示；浮层只关浮层，面板内仍关面板；不再弹「已复制」
    if (!paste.canAutoPaste()) {
      if (windows.clipboard.isVisible()) windows.hideClipboard()
      else windows.hideAllOverlays()
      return true
    }

    const restored = await windows.restorePreviousFocus()
    if (!restored) {
      notifyManualPasteHintOnce()
      return true
    }

    const ok = await paste.paste(records)
    if (!ok) {
      notifyManualPasteHintOnce()
      return true
    }
    return true
  })
}

/** 自动粘贴失败时的兜底提示：每个进程生命周期只弹一次 */
function notifyManualPasteHintOnce(): void {
  if (manualPasteHintShown) return
  manualPasteHintShown = true
  try {
    if (!Notification.isSupported()) return
    new Notification({
      title: 'c-tools',
      body:
        process.platform === 'darwin'
          ? '没有开启隐私的自动化功能，请手动到目标处按 ⌘V 粘贴'
          : '已复制，请到目标窗口按 Ctrl+V'
    }).show()
  } catch {
    /* ignore */
  }
}
