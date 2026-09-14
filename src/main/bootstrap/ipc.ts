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
import type { ClipboardFeatureHandles } from '../modules/clipboard'
import { broadcastHistory } from '../modules/clipboard'
import type { QuickFoldersFeatureHandles, QuickFoldersStore } from '../modules/quickFolders'
import type { ProjectsRuntime, ProjectsFeatureHandles } from '../modules/projects'
import type { ScreenshotFeatureHandles, ScreenshotSession } from '../modules/screenshot'
import type {
  RecorderFeatureHandles,
  RecorderHost,
  RecorderSelectSession,
  RecorderActions
} from '../modules/recorder'
import type { FeatureHost } from '../modules/feature'
import { resyncShortcutHandlers } from './shortcuts'

export type IpcSetupDeps = {
  config: ConfigManager
  shortcuts: ShortcutManager
  windows: WindowManager
  featureHost: FeatureHost
}

/**
 * 注册全部 IPC，并安装 webview 辅助。
 * Feature 贡献的 IPC 由 FeatureHost.registerAllIpc 挂载；开关变更时可热加载。
 */
export function registerAllIpc(deps: IpcSetupDeps): void {
  registerLogIpc()
  registerUpdaterIpc()
  installWebviewWindowOpenHandler()
  installGuestDevToolsLifecycle()

  deps.featureHost.registerAllIpc()

  registerCoreIpc({
    config: deps.config,
    shortcuts: deps.shortcuts,
    windows: deps.windows,
    onModuleConfigChanged: () => {
      // 热加载后剪贴板句柄可能才出现，每次现取
      const clipboard = deps.featureHost.tryGetHandles<ClipboardFeatureHandles>('clipboard')
      if (!clipboard) return
      clipboard.history.applyConfigChanged()
      broadcastHistory(clipboard.history.getAll())
    },
    onFeaturesConfigChanged: () => {
      const { loaded, warnings } = deps.featureHost.syncRuntimeFeatures()
      resyncShortcutHandlers(deps.shortcuts, deps.featureHost)
      deps.shortcuts.registerAll(deps.config.get().shortcuts)
      const msgs = [...warnings]
      for (const id of loaded) {
        const label =
          id === 'clipboard'
            ? '剪贴板'
            : id === 'quickFolders'
              ? '快捷文件夹'
              : id === 'projects'
                ? '项目'
                : id === 'screenshot'
                  ? '截屏'
                  : id === 'recorder'
                    ? '录屏'
                    : id
        msgs.push(`已启用${label}`)
      }
      return msgs
    }
  })
}

export function getClipboardHandles(featureHost: FeatureHost): ClipboardFeatureHandles | undefined {
  return featureHost.tryGetHandles<ClipboardFeatureHandles>('clipboard')
}

export function getProjectsRuntime(featureHost: FeatureHost): ProjectsRuntime | undefined {
  return featureHost.tryGetHandles<ProjectsFeatureHandles>('projects')?.runtime
}

export function getQuickFoldersStore(featureHost: FeatureHost): QuickFoldersStore | undefined {
  return featureHost.tryGetHandles<QuickFoldersFeatureHandles>('quickFolders')?.store
}

export function getScreenshotHandles(
  featureHost: FeatureHost
): ScreenshotFeatureHandles | undefined {
  return featureHost.tryGetHandles<ScreenshotFeatureHandles>('screenshot')
}

export function getRecorderHandles(featureHost: FeatureHost): RecorderFeatureHandles | undefined {
  return featureHost.tryGetHandles<RecorderFeatureHandles>('recorder')
}

export function getScreenshotSession(featureHost: FeatureHost): ScreenshotSession | undefined {
  return getScreenshotHandles(featureHost)?.session
}

export function getRecorderStack(featureHost: FeatureHost):
  | {
      host: RecorderHost
      select: RecorderSelectSession
      actions: RecorderActions
    }
  | undefined {
  const h = getRecorderHandles(featureHost)
  if (!h) return undefined
  return { host: h.host, select: h.select, actions: h.actions }
}
