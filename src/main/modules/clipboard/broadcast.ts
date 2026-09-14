import { BrowserWindow } from 'electron'

/** 向所有窗口推送剪贴板历史 */
export function broadcastHistory(records: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('history:updated', records)
  }
}

/** 向所有窗口推送收藏列表 */
export function broadcastFavorites(records: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('favorite:updated', records)
  }
}
