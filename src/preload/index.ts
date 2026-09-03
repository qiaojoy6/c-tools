import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { appApi } from './modules/app'
import { clipboardApi } from './modules/clipboard'

/** 渲染进程可用 API：各模块 bridge 组合，新增功能模块在此挂载 */
const api = { ...appApi, ...clipboardApi }

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
