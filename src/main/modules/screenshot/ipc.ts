import { ipcMain } from 'electron'
import { getFrameBuffer } from './capture'
import type { ScreenshotSession } from './session'

/**
 * 截屏 IPC
 *
 * | Channel              | 说明 |
 * |----------------------|------|
 * | screenshot:cancel    | 取消会话 |
 * | screenshot:complete  | base64 PNG → 剪贴板+历史并结束 |
 * | screenshot:save      | base64 PNG → 遮罩上弹下载对话框；成功后再结束会话 |
 * | screenshot:frame-png | 某屏冻结帧 base64（渲染导出用） |
 */
export function registerScreenshotIpc(session: ScreenshotSession): void {
  ipcMain.handle('screenshot:cancel', async (): Promise<boolean> => {
    await session.cancelAsync()
    return true
  })

  ipcMain.handle('screenshot:complete', async (_e, pngBase64: string): Promise<boolean> => {
    return session.complete(typeof pngBase64 === 'string' ? pngBase64 : '')
  })

  ipcMain.handle('screenshot:save', async (_e, pngBase64: string): Promise<boolean> => {
    return session.save(typeof pngBase64 === 'string' ? pngBase64 : '')
  })

  ipcMain.handle('screenshot:frame-png', async (_e, displayId: number): Promise<string | null> => {
    const id = Number(displayId)
    if (!Number.isFinite(id)) return null
    const buf = getFrameBuffer(`display-${id}.png`)
    if (!buf?.byteLength) return null
    return buf.toString('base64')
  })
}
