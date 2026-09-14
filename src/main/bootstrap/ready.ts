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
import type { RecorderSelectSession } from '../modules/recorder'
import type { AppContext } from './context'
import { setupClipboard } from './clipboard'
import { setupScreenshot } from './screenshot'
import { setupRecorder } from './recorder'
import { setupShortcuts } from './shortcuts'
import { setupTray } from './tray'
import { wireConfigSync } from './configSync'
import { registerAllIpc } from './ipc'
import { quitApp } from './quit'

/**
 * app.whenReady 后的组装顺序：
 * shell → clipboard → screenshot → recorder → shortcuts → tray → sync → ipc → windows
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

  // ---- clipboard / screenshot / recorder ----
  const clipboard = setupClipboard(config)

  const trayRef: { current?: TrayManager } = {}
  const selectRef: { current?: RecorderSelectSession } = {}

  const { session: screenshot, startScreenshot } = setupScreenshot({
    config,
    windows,
    images: clipboard.images,
    history: clipboard.history,
    watcher: clipboard.watcher,
    isRecorderSelectActive: () => Boolean(selectRef.current?.isActive)
  })

  const {
    host: recorderHost,
    select: recorderSelect,
    actions: recorderActions
  } = setupRecorder({
    config,
    windows,
    isScreenshotActive: () => screenshot.isActive,
    getTray: () => trayRef.current
  })
  selectRef.current = recorderSelect

  // ---- shortcuts / tray ----
  const shortcuts = setupShortcuts({
    config,
    windows,
    screenshot,
    recorderSelect,
    startScreenshot,
    recorderActions
  })

  const openSettings = (): void => {
    windows.showSettings()
  }

  const ctxRef: { current: AppContext | null } = { current: null }

  const tray = setupTray({
    config,
    windows,
    recorderHost,
    startScreenshot,
    recorderActions,
    openSettings,
    quit: () => quitApp(ctxRef.current)
  })
  trayRef.current = tray

  wireConfigSync({ config, windows, tray })

  const projects = registerAllIpc({
    config,
    shortcuts,
    windows,
    history: clipboard.history,
    favorites: clipboard.favorites,
    paste: clipboard.paste,
    screenshot,
    recorderHost,
    recorderSelect
  })

  applyLoginItem(cfg.general.launchAtLogin)
  applyNativeThemeSource(cfg.general.theme)

  clipboard.paste.notifyAccessibilityHintOnLaunch()

  windows.createPanel()
  // 预热截屏 / 录屏框选遮罩，缩短入口到可操作等待
  screenshot.prewarm()
  recorderSelect.prewarm()
  startAppUpdater()

  const ctx: AppContext = {
    config,
    windows,
    shortcuts,
    tray,
    clipboardImages: clipboard.images,
    history: clipboard.history,
    favorites: clipboard.favorites,
    paste: clipboard.paste,
    clipboardWatcher: clipboard.watcher,
    projects,
    screenshot,
    recorderHost,
    recorderSelect,
    recorderActions,
    startScreenshot,
    quitApp: () => quitApp(ctxRef.current)
  }
  ctxRef.current = ctx
  return ctx
}
