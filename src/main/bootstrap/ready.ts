import { app, session } from 'electron'
import { is, electronApp, optimizer } from '@electron-toolkit/utils'
import { resolve } from 'path'
import { applyLoginItem, ConfigManager } from '../config'
import {
  WindowManager,
  applyNativeThemeSource,
  setupAppMenu,
  startAppUpdater,
  type TrayManager
} from '../modules/core'
import { FeatureHost } from '../modules/feature'
import { clipboardFeature } from '../modules/clipboard'
import { projectsFeature } from '../modules/projects'
import { quickFoldersFeature } from '../modules/quickFolders'
import { screenshotFeature } from '../modules/screenshot'
import { recorderFeature } from '../modules/recorder'
import { hostsFeature } from '../modules/hosts'
import type { AppContext } from './context'
import { setupShortcuts } from './shortcuts'
import { setupTray } from './tray'
import { wireConfigSync } from './configSync'
import {
  getClipboardHandles,
  getProjectsRuntime,
  getQuickFoldersStore,
  getRecorderStack,
  getScreenshotHandles,
  registerAllIpc
} from './ipc'
import { quitApp } from './quit'

/**
 * app.whenReady 后的组装顺序：
 * shell → FeatureHost.setup → shortcuts → tray → sync → ipc → windows
 */
export function runWhenReady(): AppContext {
  electronApp.setAppUserModelId('com.ctools.app')

  // macOS：托盘常驻；程序坞图标随功能面板显隐（见 bindDockIconToPanel）
  // 勿在此无条件 dock.show()，否则录制中仅 skipTaskbar 窗时行为与面板脱节

  if (is.dev) {
    session.defaultSession.extensions.loadExtension(resolve(__dirname, '../../devtools/vue'))
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const config = new ConfigManager()
  const cfg = config.get()

  setupAppMenu({
    getConfig: () => config.get(),
    updateConfig: (patch) => {
      config.update(patch)
    }
  })

  const windows = new WindowManager(() => config.get())

  // 托盘延后创建；recorder Feature 经 shared.getTray 取用
  const trayRef: { current?: TrayManager } = {}

  // ---- FeatureHost：按 features.enabled 跳过禁用模块 ----
  const featureHost = new FeatureHost()
  featureHost.register(clipboardFeature)
  featureHost.register(projectsFeature)
  featureHost.register(quickFoldersFeature)
  featureHost.register(screenshotFeature)
  featureHost.register(recorderFeature)
  featureHost.register(hostsFeature)
  featureHost.setupAll({
    config,
    windows,
    shared: {
      getTray: () => trayRef.current
    }
  })

  const clipboard = getClipboardHandles(featureHost)
  const quickFolders = getQuickFoldersStore(featureHost)
  const screenshotHandles = getScreenshotHandles(featureHost)
  const recorder = getRecorderStack(featureHost)
  const projects = getProjectsRuntime(featureHost)

  // ---- shortcuts / tray（业务入口由 Feature 贡献）----
  const shortcuts = setupShortcuts({
    config,
    windows,
    featureHost
  })

  const openSettings = (): void => {
    windows.showSettings()
  }

  const ctxRef: { current: AppContext | null } = { current: null }

  const tray = setupTray({
    config,
    windows,
    featureHost,
    recorderHost: recorder?.host,
    openSettings,
    quit: () => quitApp(ctxRef.current)
  })
  trayRef.current = tray

  wireConfigSync({ config, windows, tray })

  registerAllIpc({
    config,
    shortcuts,
    windows,
    featureHost
  })

  applyLoginItem(cfg.general.launchAtLogin)
  applyNativeThemeSource(cfg.general.theme)

  clipboard?.paste.notifyAccessibilityHintOnLaunch()

  windows.createPanel()
  startAppUpdater()

  const ctx: AppContext = {
    config,
    windows,
    shortcuts,
    tray,
    featureHost,
    clipboardImages: clipboard?.images,
    history: clipboard?.history,
    favorites: clipboard?.favorites,
    paste: clipboard?.paste,
    clipboardWatcher: clipboard?.watcher,
    quickFolders,
    projects,
    screenshot: screenshotHandles?.session,
    recorderHost: recorder?.host,
    recorderSelect: recorder?.select,
    recorderActions: recorder?.actions,
    startScreenshot: screenshotHandles?.startScreenshot,
    quitApp: () => quitApp(ctxRef.current)
  }
  ctxRef.current = ctx
  return ctx
}
