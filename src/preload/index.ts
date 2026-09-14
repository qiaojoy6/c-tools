import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { appApi } from './modules/app'
import { clipboardApi } from './modules/clipboard'
import { projectsApi } from './modules/projects'
import { quickFoldersApi } from './modules/quickFolders'
import { logBridgeApi } from './modules/log'
import { screenshotApi } from './modules/screenshot'
import { recorderApi } from './modules/recorder'
import { PRELOAD_BRIDGES, assemblePreloadApi } from './feature'

/**
 * Preload：按 PRELOAD_BRIDGES 注册表组装 window.api。
 * 渲染侧只使用 window.api / window.logApi / window.electron，不直接访问 ipcRenderer。
 */
const api = assemblePreloadApi([...PRELOAD_BRIDGES]) as Api

/** 与注册表一致的公开类型（供 renderer env.d.ts） */
export type Api = typeof appApi &
  typeof clipboardApi &
  typeof projectsApi &
  typeof logBridgeApi & {
    quickFolders: typeof quickFoldersApi
    screenshot: typeof screenshotApi
    recorder: typeof recorderApi
  }

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
