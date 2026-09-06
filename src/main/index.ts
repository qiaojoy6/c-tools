/**
 * 主进程入口：组装 core / clipboard / projects，注册 IPC，启动托盘与浮层。
 *
 * 进程通信约定：
 * - invoke / handle：请求-响应（配置、历史、粘贴、项目）
 * - send / on：单向通知（隐藏浮层、打开设置）
 * - webContents.send / ipcRenderer.on：主→渲染推送（浮层显示、路由切换、历史更新）
 * Preload 经 contextBridge 暴露为 window.api，渲染进程不直接碰 ipcRenderer。
 */
import { app, BrowserWindow, nativeTheme } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { ConfigManager, applyLoginItem, DEFAULT_CONFIG } from './config'
import {
  ClipboardWatcher,
  FavoritesManager,
  HistoryManager,
  PasteService,
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
  setupAppMenu
} from './modules/core'
import { ProjectsRuntime, registerProjectsIpc } from './modules/projects'

let configManager: ConfigManager
let historyManager: HistoryManager
let favoritesManager: FavoritesManager
let pasteService: PasteService
let windowManager: WindowManager
let shortcutManager: ShortcutManager
let trayManager: TrayManager
let clipboardWatcher: ClipboardWatcher
let projectsRuntime: ProjectsRuntime

/** 单实例：已有进程时二次启动会触发 second-instance，本进程直接退出 */
const gotSingleLock = app.requestSingleInstanceLock()

if (!gotSingleLock) {
  app.quit()
} else {
  // 尽早挂诊断：意外退出 / 子进程崩溃写 logs/diag.log
  installCrashGuard()

  // 二次启动：唤起功能面板
  app.on('second-instance', () => windowManager?.showPanel())

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.ctools.app')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    // ---- 通用模块（core）----
    configManager = new ConfigManager()
    const cfg = configManager.get()

    // 菜单：Edit（⌘C/V 等）+ View；全局快捷键仅呼出剪贴板，不拦截页面内编辑键
    setupAppMenu({
      getConfig: () => configManager.get(),
      updateConfig: (patch) => {
        configManager.update(patch)
      }
    })

    windowManager = new WindowManager(() => configManager.get())

    // 全局快捷键 → 独立剪贴板浮层；Windows 先同步采焦再 toggle
    shortcutManager = new ShortcutManager(() => {
      if (!windowManager.clipboard.isVisible()) {
        windowManager.noteForegroundBeforeShow()
      }
      windowManager.toggleClipboard()
    })
    const shortcut = normalizeAccelerator(cfg.shortcuts.togglePanel)
    if (shortcut !== cfg.shortcuts.togglePanel) {
      configManager.update({ shortcuts: { togglePanel: shortcut } })
    }
    if (!shortcutManager.register(shortcut)) {
      const fallback = DEFAULT_CONFIG.shortcuts.togglePanel
      configManager.update({ shortcuts: { togglePanel: fallback } })
      shortcutManager.register(fallback)
    }

    const openSettings = (): void => {
      windowManager.showSettings()
    }

    // 设置窗关闭后重新挂上全局快捷键（录制期间可能 suspend 过）
    windowManager.onSettingsClosed = () => {
      void shortcutManager.register(configManager.get().shortcuts.togglePanel)
    }

    trayManager = new TrayManager(
      () => ({ launchAtLogin: configManager.get().general.launchAtLogin }),
      {
        // 托盘左键：始终显示/置顶；右键菜单可切换显隐
        showPanel: () => windowManager.showPanel(),
        togglePanel: () => windowManager.togglePanel(),
        openSettings,
        // 只改配置；系统登录项 / 托盘勾选 / 设置窗由 onChanged 统一同步
        toggleLogin: () => {
          const enabled = !configManager.get().general.launchAtLogin
          configManager.update({ general: { launchAtLogin: enabled } })
        },
        quit: () => quitApp()
      }
    )
    trayManager.create()

    // 配置变更：开机自启 ↔ 系统、托盘勾选、主题窗控、所有设置窗实时刷新
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

    // 跟随系统时，OS 深浅色变化同步 Win/Linux 窗控底色
    nativeTheme.on('updated', () => {
      if (configManager.get().general.theme === 'system') {
        windowManager.panel.applyChromeTheme()
      }
    })

    // ---- 功能模块（clipboard）----
    pasteService = new PasteService()

    // 历史变更时推送到所有渲染窗口（history:updated）
    historyManager = new HistoryManager(
      () => configManager.get(),
      (records) => {
        broadcastHistory(records)
      }
    )
    historyManager.init()

    favoritesManager = new FavoritesManager((records) => {
      broadcastFavorites(records)
    })
    favoritesManager.init()

    clipboardWatcher = new ClipboardWatcher(
      () => configManager.get().clipboard.pollIntervalMs,
      (capture) => historyManager.add(capture)
    )
    clipboardWatcher.start()
    // 粘贴写入系统剪贴板后同步监听基线，避免把自身写入再入库一遍
    pasteService.onClipboardWritten = () => clipboardWatcher.syncBaseline()

    // ---- IPC：core 与 clipboard 分开注册，channel 见各 ipc.ts ----
    registerLogIpc()
    registerUpdaterIpc()
    registerCoreIpc({
      config: configManager,
      shortcuts: shortcutManager,
      windows: windowManager,
      // 模块联动通过回调注入，core 不依赖具体功能模块
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

    // ---- 功能模块（projects）----
    projectsRuntime = new ProjectsRuntime()
    registerProjectsIpc({
      config: configManager,
      runtime: projectsRuntime
    })

    // 配置中的开机自启与系统保持同步；主题源尽早对齐
    applyLoginItem(cfg.general.launchAtLogin)
    applyNativeThemeSource(cfg.general.theme)

    // macOS 无辅助功能：仅启动时提示一次
    pasteService.notifyAccessibilityHintOnLaunch()

    // 预创建剪贴板 + 功能面板（隐藏）；快捷键 → 剪贴板浮层；托盘左键 / 程序坞 → 功能面板
    windowManager.createPanel()

    // 打包后自动检查更新（有新版本则下载并通知）
    startAppUpdater()

    // macOS 程序坞 / Cmd+Tab 切回：立刻置顶功能面板（captureFocus:false，避免异步采焦耽误升起）
    app.on('activate', () => windowManager.showPanel({ captureFocus: false }))
  })

  // 托盘常驻：关闭所有窗口不退出进程
  app.on('window-all-closed', () => {})

  // 只做清理，不再次 app.quit（否则 before-quit ↔ quitApp 死循环刷日志）
  app.on('before-quit', () => prepareQuit())

  app.on('will-quit', () => shortcutManager?.unregisterAll())
}

/** 主→渲染：广播剪贴历史 */
function broadcastHistory(records: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('history:updated', records)
  }
}

/** 主→渲染：广播收藏列表 */
function broadcastFavorites(records: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('favorite:updated', records)
  }
}

let quitting = false

/** 退出前清理（幂等）；由 before-quit 或托盘「退出」触发 */
function prepareQuit(): void {
  if (quitting) return
  quitting = true
  const cfg = configManager?.get()
  if (cfg?.privacy.clearOnQuit) historyManager?.clear()
  historyManager?.dispose()
  favoritesManager?.dispose()
  clipboardWatcher?.stop()
  void projectsRuntime?.stopAll()
  windowManager?.markQuitting()
}

/** 托盘等主动退出：清理后结束进程 */
function quitApp(): void {
  prepareQuit()
  app.quit()
}
