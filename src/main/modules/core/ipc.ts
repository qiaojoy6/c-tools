import { ipcMain } from 'electron'
import { DEFAULT_CONFIG } from '../../config'
import type { ConfigManager } from '../../config'
import type { AppConfig, ConfigPatch, ConfigUpdateResult, WebviewContextMenuPayload } from '@shared/types'
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

/**
 * 通用 IPC（主进程 handle / on）
 *
 * | Channel             | 方向           | 说明 |
 * |---------------------|----------------|------|
 * | config:get          | 渲染→主 invoke | 读取完整配置 |
 * | config:update       | 渲染→主 invoke | 局部更新；快捷键失败会回滚 |
 * | shortcuts:suspend   | 渲染→主 invoke | 录制快捷键前卸掉全局注册 |
 * | shortcuts:resume    | 渲染→主 invoke | 录制结束或取消后恢复 |
 * | panel:hide          | 渲染→主 send   | 隐藏独立剪贴板浮层（ESC；不关功能面板） |
 * | settings:open       | 渲染→主 send   | 打开设置窗口 |
 * | webview:contextMenu | 渲染→主 invoke | webview guest 右键菜单 |
 *
 * 主→渲染（preload 订阅）：
 * panel:shown / settings:shown / config:updated
 */
export function registerCoreIpc(deps: CoreIpcDeps): void {
  const { config, shortcuts, windows } = deps

  ipcMain.handle('config:get', (): AppConfig => config.get())

  ipcMain.handle('config:update', (_e, patch: ConfigPatch): ConfigUpdateResult => {
    const warnings: string[] = []
    const prevShortcut = config.get().shortcuts.togglePanel

    // 规范化加速键（如把非法 "Alt+ " 修成 Alt+Space）后再落盘
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

    // 快捷键变更：注册失败则回滚，避免配置与真实注册不一致
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
    // 开机自启 / 托盘勾选：由 ConfigManager.onChanged 统一同步系统与各窗口
    if (normalizedPatch?.clipboard) {
      deps.onModuleConfigChanged()
    }

    return { config: cfg, warnings }
  })

  // 录制快捷键期间先卸掉全局注册，避免抢键 / 关掉面板
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
  ipcMain.on('settings:open', () => windows.showSettings())

  // webview 右键：弹出 guest 菜单（检查 / DevTools）
  ipcMain.handle(
    'webview:contextMenu',
    (event, payload: WebviewContextMenuPayload): void => {
      popupWebviewContextMenu(event, payload)
    }
  )
}
