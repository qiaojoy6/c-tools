import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { ConfigManager, applyLoginItem } from './config'
import {
  ClipboardWatcher,
  HistoryManager,
  PasteService,
  registerClipboardIpc
} from './modules/clipboard'
import {
  ShortcutManager,
  TrayManager,
  WindowManager,
  registerCoreIpc
} from './modules/core'

let configManager: ConfigManager
let historyManager: HistoryManager
let pasteService: PasteService
let windowManager: WindowManager
let shortcutManager: ShortcutManager
let trayManager: TrayManager
let clipboardWatcher: ClipboardWatcher

const gotSingleLock = app.requestSingleInstanceLock()

if (!gotSingleLock) {
  app.quit()
} else {
  app.on('second-instance', () => windowManager?.showPanel())

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.ctools.clipboard')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    // ---- 通用模块（core）----
    configManager = new ConfigManager()
    const cfg = configManager.get()

    windowManager = new WindowManager(() => configManager.get())

    shortcutManager = new ShortcutManager(() => windowManager.togglePanel())
    shortcutManager.register(cfg.shortcuts.togglePanel)

    const openSettings = (): void => {
      windowManager.showPanel()
      windowManager.panelWindow?.webContents.send('panel:open-settings')
    }

    trayManager = new TrayManager(
      () => ({ launchAtLogin: configManager.get().general.launchAtLogin }),
      {
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

    historyManager = new HistoryManager(() => configManager.get(), (records) => {
      broadcastRecords(records)
    })
    historyManager.init()

    clipboardWatcher = new ClipboardWatcher(
      () => configManager.get().clipboard.pollIntervalMs,
      (capture) => historyManager.add(capture)
    )
    clipboardWatcher.start()

    // ---- IPC 装配：通用与功能分离 ----
    registerCoreIpc({
      config: configManager,
      shortcuts: shortcutManager,
      tray: trayManager,
      windows: windowManager,
      // 模块联动通过回调注入，core 不依赖具体功能模块
      onModuleConfigChanged: () => {
        historyManager.applyConfigChanged()
        broadcastRecords(historyManager.getAll())
      },
      openSettings
    })
    registerClipboardIpc({ history: historyManager, paste: pasteService, windows: windowManager })

    // 配置中的开机自启与系统保持同步
    applyLoginItem(cfg.general.launchAtLogin)

    windowManager.createPanel()

    app.on('activate', () => windowManager.showPanel())
  })

  // 托盘常驻：关闭窗口不退出
  app.on('window-all-closed', () => {})

  app.on('before-quit', () => quitApp())

  app.on('will-quit', () => shortcutManager?.unregisterAll())
}

function broadcastRecords(records: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('history:updated', records)
  }
}

function quitApp(): void {
  const cfg = configManager?.get()
  if (cfg?.privacy.clearOnQuit) historyManager?.clear()
  historyManager?.dispose()
  clipboardWatcher?.stop()
  windowManager?.markQuitting()
  app.quit()
}
