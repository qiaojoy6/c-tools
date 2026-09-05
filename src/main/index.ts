/**
 * 主进程入口：组装 core / clipboard / projects，注册 IPC，启动托盘与浮层。
 *
 * 进程通信约定：
 * - invoke / handle：请求-响应（配置、历史、粘贴、项目）
 * - send / on：单向通知（隐藏浮层、打开设置）
 * - webContents.send / ipcRenderer.on：主→渲染推送（浮层显示、路由切换、历史更新）
 * Preload 经 contextBridge 暴露为 window.api，渲染进程不直接碰 ipcRenderer。
 */
import { app, BrowserWindow } from 'electron'
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
  registerCoreIpc,
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
  // 用户再次打开应用时，唤起已有实例的独立剪贴板
  app.on('second-instance', () => windowManager?.showClipboard())

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.ctools.clipboard')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    // ---- 通用模块（core）----
    configManager = new ConfigManager()
    const cfg = configManager.get()

    // 精简菜单：去掉 File / Edit / Window；View 含失焦隐藏开关
    setupAppMenu({
      getConfig: () => configManager.get(),
      updateConfig: (patch) => {
        configManager.update(patch)
      }
    })

    windowManager = new WindowManager(() => configManager.get())

    // 全局快捷键 → 独立剪贴板浮层；非法配置写回规范化或默认值
    shortcutManager = new ShortcutManager(() => windowManager.toggleClipboard())
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
        // 托盘左键：功能面板；快捷键仍呼出独立剪贴板
        togglePanel: () => windowManager.togglePanel(),
        openSettings,
        toggleLogin: () => {
          const enabled = !configManager.get().general.launchAtLogin
          configManager.update({ general: { launchAtLogin: enabled } })
          applyLoginItem(enabled)
          trayManager.rebuild()
        },
        quit: () => quitApp()
      }
    )
    trayManager.create()

    // ---- 功能模块（clipboard）----
    pasteService = new PasteService()

    // 历史变更时推送到所有渲染窗口（history:updated）
    historyManager = new HistoryManager(() => configManager.get(), (records) => {
      broadcastHistory(records)
    })
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
    registerCoreIpc({
      config: configManager,
      shortcuts: shortcutManager,
      tray: trayManager,
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

    // 配置中的开机自启与系统保持同步
    applyLoginItem(cfg.general.launchAtLogin)

    // 预创建浮层（隐藏，默认 /clipboard）；快捷键 / 托盘 / activate 再显示
    windowManager.createPanel()

    app.on('activate', () => windowManager.showClipboard())
  })

  // 托盘常驻：关闭所有窗口不退出进程
  app.on('window-all-closed', () => {})

  app.on('before-quit', () => quitApp())

  app.on('will-quit', () => shortcutManager?.unregisterAll())
}

/** 主→渲染：广播剪贴历史 */
function broadcastHistory(records: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('history:updated', records)
  }
}

/** 主→渲染：广播收藏列表 */
function broadcastFavorites(records: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('favorite:updated', records)
  }
}

function quitApp(): void {
  const cfg = configManager?.get()
  if (cfg?.privacy.clearOnQuit) historyManager?.clear()
  historyManager?.dispose()
  favoritesManager?.dispose()
  clipboardWatcher?.stop()
  void projectsRuntime?.stopAll()
  windowManager?.markQuitting()
  app.quit()
}
