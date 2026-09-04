import { ipcMain } from 'electron'
import type { ClipRecord } from '@shared/types'
import type { WindowManager } from '../core/windows'
import type { HistoryManager } from './history'
import type { PasteService } from './paste'

export interface ClipboardIpcDeps {
  history: HistoryManager
  paste: PasteService
  windows: WindowManager
}

/**
 * 剪贴板模块 IPC（主进程 handle）
 *
 * | Channel          | 方向           | 说明 |
 * |------------------|----------------|------|
 * | history:list     | 渲染→主 invoke | 拉取全部历史 |
 * | history:remove   | 渲染→主 invoke | 删除单条 |
 * | history:clear    | 渲染→主 invoke | 清空全部 |
 * | clip:paste       | 渲染→主 invoke | 恢复焦点后模拟粘贴；成功返回 true |
 *
 * 主→渲染推送（入口 broadcastRecords）：
 * history:updated — 监听捕获或配置裁剪后刷新列表
 */
export function registerClipboardIpc(deps: ClipboardIpcDeps): void {
  const { history, paste, windows } = deps

  ipcMain.handle('history:list', (): ClipRecord[] => history.getAll())

  ipcMain.handle('history:remove', (_e, id: string): boolean => {
    history.remove(id)
    return true
  })

  ipcMain.handle('history:clear', (): boolean => {
    history.clear()
    return true
  })

  /**
   * 粘贴流程：置顶选用记录 → 隐藏面板并激活原应用 → 写入剪贴板并模拟 Cmd/Ctrl+V
   */
  ipcMain.handle('clip:paste', async (_e, ids: string[]): Promise<boolean> => {
    const records = (ids ?? [])
      .map((id) => history.get(id))
      .filter((r): r is ClipRecord => Boolean(r))
    if (!records.length) return false
    history.touch(records.map((r) => r.id))
    const restored = await windows.restorePreviousFocus()
    if (!restored) return false
    return paste.paste(records)
  })
}
