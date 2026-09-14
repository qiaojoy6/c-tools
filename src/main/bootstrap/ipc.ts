import type { ConfigManager } from '../config'
import {
  registerCoreIpc,
  registerLogIpc,
  registerUpdaterIpc,
  installWebviewWindowOpenHandler,
  installGuestDevToolsLifecycle,
  type ShortcutManager,
  type WindowManager
} from '../modules/core'
import {
  registerClipboardIpc,
  type HistoryManager,
  type FavoritesManager,
  type PasteService
} from '../modules/clipboard'
import { ProjectsRuntime, registerProjectsIpc } from '../modules/projects'
import { registerScreenshotIpc, type ScreenshotSession } from '../modules/screenshot'
import {
  registerRecorderIpc,
  type RecorderHost,
  type RecorderSelectSession
} from '../modules/recorder'
import { broadcastHistory } from './broadcast'

export type IpcSetupDeps = {
  config: ConfigManager
  shortcuts: ShortcutManager
  windows: WindowManager
  history: HistoryManager
  favorites: FavoritesManager
  paste: PasteService
  screenshot: ScreenshotSession
  recorderHost: RecorderHost
  recorderSelect: RecorderSelectSession
}

/** 注册全部 IPC，并安装 webview 辅助；返回 projects 运行时 */
export function registerAllIpc(deps: IpcSetupDeps): ProjectsRuntime {
  registerLogIpc()
  registerUpdaterIpc()
  // webview target=_blank / window.open → 宿主开页签（deny 系统弹窗）
  installWebviewWindowOpenHandler()
  // guest 销毁时关掉对应开发者工具独立窗
  installGuestDevToolsLifecycle()

  const projects = new ProjectsRuntime()
  registerProjectsIpc({
    config: deps.config,
    runtime: projects
  })

  registerCoreIpc({
    config: deps.config,
    shortcuts: deps.shortcuts,
    windows: deps.windows,
    onModuleConfigChanged: () => {
      deps.history.applyConfigChanged()
      broadcastHistory(deps.history.getAll())
    }
  })
  registerClipboardIpc({
    history: deps.history,
    favorites: deps.favorites,
    paste: deps.paste,
    windows: deps.windows
  })
  registerScreenshotIpc(deps.screenshot)
  registerRecorderIpc(deps.recorderHost, deps.recorderSelect, {
    persistAudioPrefs: (prefs) => {
      deps.config.update({ recorder: prefs })
    },
    persistRecorderPrefs: (prefs) => {
      deps.config.update({ recorder: prefs })
    }
  })

  return projects
}
