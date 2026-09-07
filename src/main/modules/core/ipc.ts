import { ipcMain } from 'electron'
import { DEFAULT_CONFIG } from '../../config'
import type { ConfigManager } from '../../config'
import type {
  AppConfig,
  ConfigPatch,
  ConfigUpdateResult,
  ShortcutConfig,
  WebviewContextMenuPayload
} from '@shared/types'
import { normalizeAccelerator, type ShortcutManager } from './shortcutManager'
import type { WindowManager } from './windows'
import { popupWebviewContextMenu } from './webviewContextMenu'

export interface CoreIpcDeps {
  config: ConfigManager
  shortcuts: ShortcutManager
  windows: WindowManager
  /** 各功能模块对配置变更的联动（由入口装配注入，如剪贴板裁剪/清理/广播） */
  onModuleConfigChanged: () => void
}

function normalizeShortcutPatch(patch: ConfigPatch | undefined): ConfigPatch | undefined {
  if (!patch?.shortcuts) return patch
  const next: Partial<ShortcutConfig> = { ...patch.shortcuts }
  if (patch.shortcuts.togglePanel !== undefined) {
    next.togglePanel = normalizeAccelerator(patch.shortcuts.togglePanel)
  }
  if (patch.shortcuts.screenshot !== undefined) {
    next.screenshot = normalizeAccelerator(patch.shortcuts.screenshot)
  }
  return { ...patch, shortcuts: next }
}

/**
 * 通用 IPC（主进程 handle / on）
 */
export function registerCoreIpc(deps: CoreIpcDeps): void {
  const { config, shortcuts, windows } = deps

  ipcMain.handle('config:get', (): AppConfig => config.get())

  ipcMain.handle('config:update', (_e, patch: ConfigPatch): ConfigUpdateResult => {
    const warnings: string[] = []
    const prev = config.get()
    const normalizedPatch = normalizeShortcutPatch(patch)
    const cfg = config.update(normalizedPatch ?? {})

    const shortcutChanged =
      normalizedPatch?.shortcuts?.togglePanel !== undefined ||
      normalizedPatch?.shortcuts?.screenshot !== undefined

    if (shortcutChanged) {
      const failed = shortcuts.registerAll(cfg.shortcuts)
      if (failed.length) {
        for (const key of failed) {
          warnings.push(`快捷键 ${cfg.shortcuts[key]} 注册失败，可能已被占用`)
        }
        // 回滚失败项
        const revert: Partial<ShortcutConfig> = {}
        for (const key of failed) {
          revert[key] = prev.shortcuts[key]
        }
        const reverted = config.update({ shortcuts: revert })
        const failedAgain = shortcuts.registerAll(reverted.shortcuts)
        if (failedAgain.length) {
          config.update({
            shortcuts: {
              togglePanel: DEFAULT_CONFIG.shortcuts.togglePanel,
              screenshot: DEFAULT_CONFIG.shortcuts.screenshot
            }
          })
          shortcuts.registerAll(DEFAULT_CONFIG.shortcuts)
          return { config: config.get(), warnings }
        }
        return { config: reverted, warnings }
      }
    }

    if (normalizedPatch?.clipboard) {
      deps.onModuleConfigChanged()
    }

    return { config: cfg, warnings }
  })

  ipcMain.handle('shortcuts:suspend', (): boolean => {
    shortcuts.unregisterAll()
    return true
  })

  ipcMain.handle('shortcuts:resume', (): boolean => {
    const current = config.get().shortcuts
    const failed = shortcuts.registerAll(current)
    if (!failed.length) return true
    config.update({
      shortcuts: {
        togglePanel: DEFAULT_CONFIG.shortcuts.togglePanel,
        screenshot: DEFAULT_CONFIG.shortcuts.screenshot
      }
    })
    shortcuts.registerAll(DEFAULT_CONFIG.shortcuts)
    return true
  })

  ipcMain.on('panel:hide', () => windows.hidePanel())
  ipcMain.on('settings:open', () => windows.showSettings())

  ipcMain.handle(
    'webview:contextMenu',
    (event, payload: WebviewContextMenuPayload): void => {
      popupWebviewContextMenu(event, payload)
    }
  )
}
