import { BrowserWindow, ipcMain } from 'electron'
import type { HostsAuthSession, HostsMutationResult, HostsScheme } from '@shared/types'
import { getHostsElevateSession } from './elevateSession'
import { HostsStore } from './store'

function broadcastAuthSession(info: HostsAuthSession): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('hosts:authSession', info)
  }
}

/**
 * Hosts IPC：注册 `hosts:*` handle，并将 store 变更广播给所有窗口。
 *
 * | Channel                   | 入参                         | 说明 |
 * |---------------------------|------------------------------|------|
 * | hosts:list                | —                            | 返回全部方案 |
 * | hosts:add                 | name                         | 新建方案（立刻落本地，开关默认关） |
 * | hosts:rename              | id, name                     | 改展示名（匹配仍认 id） |
 * | hosts:setContent          | id, content                  | 写本地内容；方案已开启则提权同步系统 |
 * | hosts:setEnabled          | id, enabled                  | 开：写入该段；关：删除该段（提权） |
 * | hosts:remove              | id                           | 删除方案（须已关闭开关） |
 * | hosts:reorder             | ids                          | 重排；存在开启项时提权重写系统 |
 * | hosts:removeAllFromSystem | —                            | 提权清除全部 c-tools 段并关开关 |
 * | hosts:getAuthSession      | —                            | 免密会话状态（下次需授权时间） |
 *
 * 主→渲染：`hosts:updated`（schemes 全量）；`hosts:authSession`（免密会话）
 */
export function registerHostsIpc(store: HostsStore): void {
  const session = getHostsElevateSession()
  session.setOnAuthChange(broadcastAuthSession)

  store.setOnUpdate((schemes) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('hosts:updated', schemes)
    }
  })

  ipcMain.handle('hosts:list', (): HostsScheme[] => store.list())

  ipcMain.handle('hosts:add', (_e, name: string): HostsMutationResult => {
    return store.add(typeof name === 'string' ? name : '')
  })

  ipcMain.handle('hosts:rename', (_e, id: string, name: string): HostsMutationResult => {
    if (typeof id !== 'string' || !id) return { ok: false, error: '无效 id' }
    return store.rename(id, typeof name === 'string' ? name : '')
  })

  ipcMain.handle(
    'hosts:setContent',
    async (_e, id: string, content: string): Promise<HostsMutationResult> => {
      if (typeof id !== 'string' || !id) return { ok: false, error: '无效 id' }
      return store.setContent(id, typeof content === 'string' ? content : '')
    }
  )

  ipcMain.handle(
    'hosts:setEnabled',
    async (_e, id: string, enabled: boolean): Promise<HostsMutationResult> => {
      if (typeof id !== 'string' || !id) return { ok: false, error: '无效 id' }
      return store.setEnabled(id, Boolean(enabled))
    }
  )

  ipcMain.handle('hosts:remove', (_e, id: string): HostsMutationResult => {
    if (typeof id !== 'string' || !id) return { ok: false, error: '无效 id' }
    return store.remove(id)
  })

  ipcMain.handle('hosts:reorder', async (_e, ids: string[]): Promise<HostsMutationResult> => {
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {
      return { ok: false, error: '顺序无效' }
    }
    return store.reorder(ids)
  })

  ipcMain.handle('hosts:removeAllFromSystem', async (): Promise<HostsMutationResult> => {
    return store.removeAllFromSystem()
  })

  ipcMain.handle('hosts:getAuthSession', (): HostsAuthSession => session.getAuthSession())
}
