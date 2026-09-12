/**
 * 主进程入口：组装 core / clipboard / projects / screenshot / recorder，注册 IPC，启动托盘与浮层。
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
  installWebviewWindowOpenHandler,
  installGuestDevToolsLifecycle
} from './modules/core'
import { registerAllCustomSchemes } from './modules/core/schemes'
import { ProjectsRuntime, registerProjectsIpc } from './modules/projects'
import {
  ScreenshotSession,
  installScreenshotImageProtocol,
  registerScreenshotIpc
} from './modules/screenshot'
import { RecorderHost, RecorderSelectSession, registerRecorderIpc } from './modules/recorder'
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
let recorderHost: RecorderHost
let recorderSelectSession: RecorderSelectSession

const gotSingleLock = app.requestSingleInstanceLock()

if (!gotSingleLock) {
  app.quit()
} else {
  installCrashGuard()

  app.on('second-instance', () => windowManager?.showPanel())

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.ctools.app')

    // macOS：托盘常驻；程序坞图标随功能面板显隐（见 bindDockIconToPanel）
    // 勿在此无条件 dock.show()，否则录制中仅 skipTaskbar 窗时行为与面板脱节

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
      if (recorderSelectSession?.isActive) return
      void screenshotSession?.start()
    }

    /** 录屏快捷键回调：函数体在 startRegion/Fullscreen 定义后挂上 */
    const recorderHotkeys = {
      startRegion: (): void => {},
      startFullscreen: (): void => {}
    }

    shortcutManager = new ShortcutManager({
      toggleClipboard: () => {
        if (screenshotSession?.isActive) return
        if (recorderSelectSession?.isActive) return
        if (!windowManager.clipboard.isVisible()) {
          windowManager.noteForegroundBeforeShow()
        }
        windowManager.toggleClipboard()
      },
      screenshot: () => {
        if (recorderSelectSession?.isActive) return
        startScreenshot()
      },
      recorderRegion: () => {
        recorderHotkeys.startRegion()
      },
      recorderFullscreen: () => {
        recorderHotkeys.startFullscreen()
      }
    })

    // 规范化并注册全部快捷键
    const nextShortcuts = {
      toggleClipboard: normalizeAccelerator(cfg.shortcuts.toggleClipboard),
      screenshot: normalizeAccelerator(cfg.shortcuts.screenshot),
      recorderRegion: normalizeAccelerator(cfg.shortcuts.recorderRegion ?? ''),
      recorderFullscreen: normalizeAccelerator(cfg.shortcuts.recorderFullscreen ?? '')
    }
    if (
      nextShortcuts.toggleClipboard !== cfg.shortcuts.toggleClipboard ||
      nextShortcuts.screenshot !== cfg.shortcuts.screenshot ||
      nextShortcuts.recorderRegion !== (cfg.shortcuts.recorderRegion ?? '') ||
      nextShortcuts.recorderFullscreen !== (cfg.shortcuts.recorderFullscreen ?? '')
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

    // 录屏宿主尽早创建，托盘菜单可读状态
    recorderHost = new RecorderHost()
    recorderHost.load()
    recorderSelectSession = new RecorderSelectSession({
      host: recorderHost,
      hideAppWindows: () => windowManager.captureAndHideAppWindows(),
      captureExternalFocus: () => windowManager.captureScreenshotExternalFocus(),
      settleAfterSelect: (opts) => windowManager.settleAfterScreenshot(opts),
      onRecordingChanged: () => trayManager?.rebuild(),
      getFullscreenFloatPos: () => {
        const pos = configManager.get().recorder.fullscreenFloatPos
        if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return null
        return { x: pos.x, y: pos.y }
      },
      setFullscreenFloatPos: (pos) => {
        configManager.update({
          recorder: { fullscreenFloatPos: { x: pos.x, y: pos.y } }
        })
      },
      persistRecorderPrefs: (prefs) => {
        configManager.update({ recorder: prefs })
      }
    })

    /** 区域录屏：框选会话；框选中再点则取消 */
    const startRegionRecord = async (): Promise<void> => {
      if (!recorderHost || !recorderSelectSession) return
      try {
        if (recorderSelectSession.isActive) {
          await recorderSelectSession.cancelAsync()
          return
        }
        if (screenshotSession?.isActive) return
        const st = recorderHost.status()
        if (!st.available) {
          console.error('[recorder] unavailable:', st.reason)
          return
        }
        if (st.state !== 'idle') return
        await recorderSelectSession.startRegion()
      } catch (err) {
        console.error('[recorder] region start failed:', err)
      } finally {
        trayManager?.rebuild()
      }
    }

    /** 全屏录屏：选屏 Dialog（Rust xcap listScreens） + 声音/清晰度 */
    const startFullscreenRecord = async (): Promise<void> => {
      if (!recorderHost || !recorderSelectSession) return
      try {
        if (screenshotSession?.isActive) return
        const st = recorderHost.status()
        if (!st.available) {
          console.error('[recorder] unavailable:', st.reason)
          return
        }
        if (st.state !== 'idle') return
        await recorderSelectSession.startFullscreen()
      } catch (err) {
        console.error('[recorder] fullscreen start failed:', err)
      } finally {
        trayManager?.rebuild()
      }
    }

    recorderHotkeys.startRegion = () => {
      void startRegionRecord()
    }
    recorderHotkeys.startFullscreen = () => {
      void startFullscreenRecord()
    }

    /** 录制中停止并收外框；成片后弹自定义保存路径 */
    const stopScreenRecord = (): void => {
      if (!recorderSelectSession) return
      recorderSelectSession.stopRecording({ promptSave: true })
      trayManager?.rebuild()
    }

    const togglePauseRecord = (): void => {
      if (!recorderHost) return
      try {
        const st = recorderHost.status()
        if (st.state === 'recording') {
          recorderHost.pause()
        } else if (st.state === 'paused') {
          recorderHost.resume()
        }
      } catch (err) {
        console.error('[recorder] pause/resume failed:', err)
      } finally {
        trayManager?.rebuild()
      }
    }

    windowManager.onSettingsClosed = () => {
      shortcutManager.registerAll(configManager.get().shortcuts)
    }

    trayManager = new TrayManager(
      () => {
        const rs = recorderHost?.status().state
        const recordingState =
          rs === 'recording' || rs === 'paused' ? rs : ('idle' as const)
        const cfg = configManager.get()
        return {
          launchAtLogin: cfg.general.launchAtLogin,
          recordingState,
          shortcuts: cfg.shortcuts
        }
      },
      {
        showPanel: () => windowManager.showPanel(),
        togglePanel: () => windowManager.togglePanel(),
        openSettings,
        startScreenshot,
        startRegionRecord: () => {
          void startRegionRecord()
        },
        startFullscreenRecord: () => {
          void startFullscreenRecord()
        },
        stopRecord: () => {
          stopScreenRecord()
        },
        togglePauseRecord,
        toggleLogin: () => {
          const enabled = !configManager.get().general.launchAtLogin
          configManager.update({ general: { launchAtLogin: enabled } })
        },
        quit: () => quitApp()
      }
    )
    trayManager.create()
    recorderHost.onEvent((event) => {
      if (
        event.type === 'finished' ||
        (event.type === 'stateChanged' && event.state === 'idle')
      ) {
        recorderSelectSession?.hideRecordingBorder()
      }
      trayManager?.rebuild()
    })

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
    // guest 销毁时关掉对应开发者工具独立窗
    installGuestDevToolsLifecycle()

    projectsRuntime = new ProjectsRuntime()
    registerProjectsIpc({
      config: configManager,
      runtime: projectsRuntime
    })

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
    registerRecorderIpc(recorderHost, recorderSelectSession, {
      persistAudioPrefs: (prefs) => {
        configManager.update({ recorder: prefs })
      },
      persistRecorderPrefs: (prefs) => {
        configManager.update({ recorder: prefs })
      }
    })

    applyLoginItem(cfg.general.launchAtLogin)
    applyNativeThemeSource(cfg.general.theme)

    pasteService.notifyAccessibilityHintOnLaunch()

    windowManager.createPanel()
    // 预热截屏 / 录屏框选遮罩，缩短入口到可操作等待
    screenshotSession.prewarm()
    recorderSelectSession.prewarm()
    startAppUpdater()

    app.on('activate', () => {
      // 截屏 / 录屏框选中或刚结束还焦时勿抬起功能面板
      if (screenshotSession?.blocksPanelActivate) return
      if (recorderSelectSession?.blocksPanelActivate) return
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
  recorderSelectSession?.hideRecordingBorder()
  recorderSelectSession?.cancel()
  recorderHost?.dispose()

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
