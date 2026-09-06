/**
 * 自动更新 IPC
 *
 * | Channel           | 方向           | 说明 |
 * |-------------------|----------------|------|
 * | updater:status    | 渲染→主 invoke | 当前状态 |
 * | updater:check     | 渲染→主 invoke | 检查更新 |
 * | updater:install   | 渲染→主 invoke | 重启安装已下载版本 |
 *
 * 主→渲染推送：updater:status
 */
import { ipcMain } from 'electron'
import type { UpdateStatus } from '@shared/types'
import {
  checkForUpdates,
  getUpdateStatus,
  quitAndInstallUpdate
} from './appUpdater'

export function registerUpdaterIpc(): void {
  ipcMain.handle('updater:status', (): UpdateStatus => getUpdateStatus())
  ipcMain.handle('updater:check', (): Promise<UpdateStatus> => checkForUpdates())
  ipcMain.handle('updater:install', (): boolean => quitAndInstallUpdate())
}
