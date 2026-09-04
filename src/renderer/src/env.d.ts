/// <reference types="vite/client" />

import type { ElectronAPI } from '@electron-toolkit/preload'
import type { AppApi } from '../../preload/modules/app'
import type { ClipboardApi } from '../../preload/modules/clipboard'

/** 与 preload 暴露的 window.api 对齐 */
type Api = AppApi & ClipboardApi

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}

export {}
