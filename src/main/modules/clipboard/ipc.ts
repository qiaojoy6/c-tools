import { ipcMain } from 'electron'
import type { ClipRecord } from '../../../shared/types'
import type { WindowManager } from '../core/windowManager'
import type { HistoryManager } from './history'
import type { PasteService } from './paste'

export interface ClipboardIpcDeps {
  history: HistoryManager
  paste: PasteService
  windows: WindowManager
}

/** 剪贴板模块 IPC：历史记录管理与粘贴 */
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
