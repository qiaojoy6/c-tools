/**
 * 主进程入口：组装 core / clipboard / projects / screenshot，注册 IPC，启动托盘与浮层。
 */
import { app, BrowserWindow, nativeTheme, session } from 'electron'
import { is } from '@electron-toolkit/utils'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { ConfigManager, applyLoginItem, DEFAULT_CONFIG } from './config'
import {
  ClipboardImageStore,
  ClipboardWatcher,
  FavoritesManager,
  HistoryManager,
  PasteService,
  installClipboardImageProtocol,
  registerClipboardIpc
} from './modules/clipboard'
import {
  ShortcutManager,
  TrayManager,
  WindowManager,
  applyNativeThemeSource,
  installCrashGuard,
  registerCoreIpc,
  registerLogIpc,
  registerUpdaterIpc,
  startAppUpdater,
  normalizeAccelerator,
  setupAppMenu,
  installWebviewWindowOpenHandler
} from './modules/core'
import { registerAllCustomSchemes } from './modules/core/schemes'
import { ProjectsRuntime, registerProjectsIpc } from './modules/projects'
import {
  ScreenshotSession,
  installScreenshotImageProtocol,
  registerScreenshotIpc
} from './modules/screenshot'
import { resolve } from 'path'

// 自定义协议须在 ready 前一次性注册（不可分两次调用）
registerAllCustomSchemes()

let configManager: ConfigManager
let clipboardImages: ClipboardImageStore
let historyManager: HistoryManager
let favoritesManager: FavoritesManager
let pasteService: PasteService
let windowManager: WindowManager
let shortcutManager: ShortcutManager
let trayManager: TrayManager
let clipboardWatcher: ClipboardWatcher
let projectsRuntime: ProjectsRuntime
let screenshotSession: ScreenshotSession

const gotSingleLock = app.requestSingleInstanceLock()

if (!gotSingleLock) {
  app.quit()
} else {
  installCrashGuard()

  app.on('second-instance', () => windowManager?.showPanel())

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.ctools.app')

    // macOS：托盘 + 程序坞并存（activate / Cmd+Tab 依赖 Dock 图标）
    if (process.platform === 'darwin') {
      app.dock?.show()
    }

    // 开发环境加载远程URL，生产环境加载本地HTML文件
    if (is.dev) {
      // 新增的：安装本地vue-devtools扩展
      session.defaultSession.extensions.loadExtension(resolve(__dirname, '../../devtools/vue'))
    }

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    configManager = new ConfigManager()
    const cfg = configManager.get()

    setupAppMenu({
      getConfig: () => configManager.get(),
      updateConfig: (patch) => {
        configManager.update(patch)
      }
    })

    windowManager = new WindowManager(() => configManager.get())

    const startScreenshot = (): void => {
      void screenshotSession?.start()
    }

    shortcutManager = new ShortcutManager({
      togglePanel: () => {
        if (screenshotSession?.isActive) return
        if (!windowManager.clipboard.isVisible()) {
          windowManager.noteForegroundBeforeShow()
        }
        windowManager.toggleClipboard()
      },
      screenshot: () => {
        startScreenshot()
      }
    })

    // 规范化并注册全部快捷键
    const nextShortcuts = {
      togglePanel: normalizeAccelerator(cfg.shortcuts.togglePanel),
      screenshot: normalizeAccelerator(cfg.shortcuts.screenshot)
    }
    if (
      nextShortcuts.togglePanel !== cfg.shortcuts.togglePanel ||
      nextShortcuts.screenshot !== cfg.shortcuts.screenshot
    ) {
      configManager.update({ shortcuts: nextShortcuts })
    }
    const failed = shortcutManager.registerAll(configManager.get().shortcuts)
    if (failed.length) {
      configManager.update({ shortcuts: DEFAULT_CONFIG.shortcuts })
      shortcutManager.registerAll(DEFAULT_CONFIG.shortcuts)
    }

    const openSettings = (): void => {
      windowManager.showSettings()
    }

    windowManager.onSettingsClosed = () => {
      shortcutManager.registerAll(configManager.get().shortcuts)
    }

    trayManager = new TrayManager(
      () => ({ launchAtLogin: configManager.get().general.launchAtLogin }),
      {
        showPanel: () => windowManager.showPanel(),
        togglePanel: () => windowManager.togglePanel(),
        openSettings,
        startScreenshot,
        toggleLogin: () => {
          const enabled = !configManager.get().general.launchAtLogin
          configManager.update({ general: { launchAtLogin: enabled } })
        },
        quit: () => quitApp()
      }
    )
    trayManager.create()

    configManager.onChanged = (next, prev) => {
      if (next.general.launchAtLogin !== prev.general.launchAtLogin) {
        applyLoginItem(next.general.launchAtLogin)
      }
      if (next.general.theme !== prev.general.theme) {
        applyNativeThemeSource(next.general.theme)
        windowManager.panel.applyChromeTheme()
      }
      trayManager.rebuild()
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send('config:updated', next)
      }
    }

    nativeTheme.on('updated', () => {
      if (configManager.get().general.theme === 'system') {
        windowManager.panel.applyChromeTheme()
      }
    })

    // ---- clipboard ----
    clipboardImages = new ClipboardImageStore()
    installClipboardImageProtocol(clipboardImages)
    installScreenshotImageProtocol()

    const reconcileClipboardImages = (): void => {
      const refs = [...historyManager.referencedFileIds(), ...favoritesManager.referencedFileIds()]
      clipboardImages.purgeOrphans(refs)
    }

    pasteService = new PasteService(clipboardImages)

    historyManager = new HistoryManager(
      () => configManager.get(),
      (records) => broadcastHistory(records),
      reconcileClipboardImages
    )

    favoritesManager = new FavoritesManager(
      (records) => broadcastFavorites(records),
      reconcileClipboardImages
    )

    favoritesManager.init()
    historyManager.init()
    reconcileClipboardImages()

    clipboardWatcher = new ClipboardWatcher(
      () => configManager.get().clipboard.pollIntervalMs,
      (capture) => historyManager.add(capture),
      clipboardImages
    )
    clipboardWatcher.start()
    pasteService.onClipboardWritten = () => clipboardWatcher.syncBaseline()

    // ---- screenshot ----
    screenshotSession = new ScreenshotSession({
      getConfig: () => configManager.get(),
      images: clipboardImages,
      history: historyManager,
      syncBaseline: () => clipboardWatcher.syncBaseline(),
      hideAppWindows: () => windowManager.captureAndHideAppWindows(),
      captureExternalFocus: () => windowManager.captureScreenshotExternalFocus(),
      settleAfterScreenshot: (opts) => windowManager.settleAfterScreenshot(opts)
    })

    registerLogIpc()
    registerUpdaterIpc()
    // webview target=_blank / window.open → 宿主开页签（deny 系统弹窗）
    installWebviewWindowOpenHandler()
    registerCoreIpc({
      config: configManager,
      shortcuts: shortcutManager,
      windows: windowManager,
      onModuleConfigChanged: () => {
        historyManager.applyConfigChanged()
        broadcastHistory(historyManager.getAll())
      }
    })
    registerClipboardIpc({
      history: historyManager,
      favorites: favoritesManager,
      paste: pasteService,
      windows: windowManager
    })
    registerScreenshotIpc(screenshotSession)

    projectsRuntime = new ProjectsRuntime()
    registerProjectsIpc({
      config: configManager,
      runtime: projectsRuntime
    })

    applyLoginItem(cfg.general.launchAtLogin)
    applyNativeThemeSource(cfg.general.theme)

    pasteService.notifyAccessibilityHintOnLaunch()

    windowManager.createPanel()
    // 预热截屏遮罩，缩短快捷键到可截的等待
    screenshotSession.prewarm()
    startAppUpdater()

    app.on('activate', () => {
      // 截屏中/刚结束还焦时勿抬起功能面板
      if (screenshotSession?.blocksPanelActivate) return
      windowManager.showPanel({ captureFocus: false })
    })
  })

  app.on('window-all-closed', () => {})
  app.on('before-quit', () => prepareQuit())
  app.on('will-quit', () => shortcutManager?.unregisterAll())
}

function broadcastHistory(records: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('history:updated', records)
  }
}

function broadcastFavorites(records: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('favorite:updated', records)
  }
}

let quitting = false

function prepareQuit(): void {
  if (quitting) return
  quitting = true
  screenshotSession?.cancel()

  const cfg = configManager?.get()
  if (cfg?.privacy.clearOnQuit) historyManager?.clear()
  historyManager?.dispose()
  favoritesManager?.dispose()
  clipboardWatcher?.stop()
  void projectsRuntime?.stopAll()
  windowManager?.markQuitting()
}

function quitApp(): void {
  prepareQuit()
  app.quit()
}
