import { ipcMain } from 'electron'
import { applyLoginItem, DEFAULT_CONFIG } from '../../config'
import type { AppConfig, ConfigPatch, ConfigUpdateResult } from '../../../shared/types'
import type { ConfigManager } from '../../config'
import { normalizeAccelerator, type ShortcutManager } from './shortcutManager'
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
    const prevShortcut = config.get().shortcuts.togglePanel

    const normalizedPatch: ConfigPatch = patch?.shortcuts?.togglePanel
      ? {
          ...patch,
          shortcuts: {
            ...patch.shortcuts,
            togglePanel: normalizeAccelerator(patch.shortcuts.togglePanel)
          }
        }
      : patch

    const cfg = config.update(normalizedPatch)

    if (normalizedPatch?.shortcuts?.togglePanel !== undefined) {
      const next = cfg.shortcuts.togglePanel
      const ok = shortcuts.register(next)
      if (!ok) {
        warnings.push(`快捷键 ${next} 注册失败，可能已被其他应用占用`)
        const safePrev =
          normalizeAccelerator(prevShortcut) || DEFAULT_CONFIG.shortcuts.togglePanel
        const reverted = config.update({ shortcuts: { togglePanel: safePrev } })
        if (!shortcuts.register(safePrev)) {
          const fallback = DEFAULT_CONFIG.shortcuts.togglePanel
          config.update({ shortcuts: { togglePanel: fallback } })
          shortcuts.register(fallback)
          return { config: config.get(), warnings }
        }
        return { config: reverted, warnings }
      }
    }
    if (normalizedPatch?.general?.launchAtLogin !== undefined) {
      applyLoginItem(cfg.general.launchAtLogin)
      tray.rebuild()
    }
    if (normalizedPatch?.clipboard) {
      deps.onModuleConfigChanged()
    }

    return { config: cfg, warnings }
  })

  /** 录制快捷键期间先卸掉全局注册，避免抢键/关掉面板 */
  ipcMain.handle('shortcuts:suspend', (): boolean => {
    shortcuts.unregisterAll()
    return true
  })

  ipcMain.handle('shortcuts:resume', (): boolean => {
    const current = config.get().shortcuts.togglePanel
    if (shortcuts.register(current)) return true
    const fallback = DEFAULT_CONFIG.shortcuts.togglePanel
    config.update({ shortcuts: { togglePanel: fallback } })
    return shortcuts.register(fallback)
  })

  ipcMain.on('panel:hide', () => windows.hidePanel())
  ipcMain.on('panel:open-settings', () => deps.openSettings())
}
