import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { appApi } from './modules/app'
import { clipboardApi } from './modules/clipboard'
import { projectsApi } from './modules/projects'
import { quickFoldersApi } from './modules/quickFolders'
import { logBridgeApi } from './modules/log'
import { screenshotApi } from './modules/screenshot'
import { recorderApi } from './modules/recorder'

/**
 * Preload：把安全的 IPC 封装暴露给渲染进程。
 * 渲染侧只使用 window.api / window.logApi / window.electron，不直接访问 ipcRenderer。
 * 新增功能模块时在此合并对应 bridge。
 */
const api = {
  ...appApi,
  ...clipboardApi,
  ...projectsApi,
  ...logBridgeApi,
  quickFolders: quickFoldersApi,
  screenshot: screenshotApi,
  recorder: recorderApi
}

export type Api = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
