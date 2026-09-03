import { ipcMain } from 'electron'
import { applyLoginItem } from '../../config'
import type { AppConfig, ConfigPatch, ConfigUpdateResult } from '../../../shared/types'
import type { ConfigManager } from '../../config'
import type { ShortcutManager } from './shortcutManager'
import type { TrayManager } from './trayManager'
import type { WindowManager } from './windowManager'

export interface CoreIpcDeps {
  config: ConfigManager
  shortcuts: ShortcutManager
  tray: TrayManager
  windows: WindowManager
  /** 各功能模块对配置变更的联动（由入口装配注入，如剪贴板裁剪/清理/广播） */
  onModuleConfigChanged: () => void
  openSettings: () => void
}

/** 通用 IPC：配置读写与面板控制（与具体功能无关） */
export function registerCoreIpc(deps: CoreIpcDeps): void {
  const { config, shortcuts, tray, windows } = deps

  ipcMain.handle('config:get', (): AppConfig => config.get())

  ipcMain.handle('config:update', (_e, patch: ConfigPatch): ConfigUpdateResult => {
    const warnings: string[] = []
    const cfg = config.update(patch)

    if (patch?.shortcuts?.togglePanel !== undefined) {
      const ok = shortcuts.register(cfg.shortcuts.togglePanel)
      if (!ok) {
        warnings.push(`快捷键 ${cfg.shortcuts.togglePanel} 注册失败，可能已被其他应用占用`)
      }
    }
    if (patch?.general?.launchAtLogin !== undefined) {
      applyLoginItem(cfg.general.launchAtLogin)
      tray.rebuild()
    }
    if (patch?.clipboard) {
      deps.onModuleConfigChanged()
    }

    return { config: cfg, warnings }
  })

  ipcMain.on('panel:hide', () => windows.hidePanel())
  ipcMain.on('panel:open-settings', () => deps.openSettings())
}
