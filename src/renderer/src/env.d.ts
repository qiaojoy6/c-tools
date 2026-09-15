/// <reference types="vite/client" />

import type { ElectronAPI } from '@electron-toolkit/preload'
import type { LogApi } from '@shared/types'
import type { AppApi } from '../../preload/modules/app'
import type { ClipboardApi } from '../../preload/modules/clipboard'
import type { ProjectsApi } from '../../preload/modules/projects'
import type { QuickFoldersApi } from '../../preload/modules/quickFolders'
import type { LogBridgeApi } from '../../preload/modules/log'
import type { ScreenshotApi } from '../../preload/modules/screenshot'
import type { RecorderApi } from '../../preload/modules/recorder'
import type { HostsApi } from '../../preload/modules/hosts'

/** 与 preload 暴露的 window.api 对齐 */
type Api = AppApi &
  ClipboardApi &
  ProjectsApi &
  LogBridgeApi & {
    quickFolders: QuickFoldersApi
    screenshot: ScreenshotApi
    recorder: RecorderApi
    hosts: HostsApi
  }

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
    /** 由 installLogApi 挂载；若挂载失败请 import { logApi } */
    logApi: LogApi
  }
}

export {}
