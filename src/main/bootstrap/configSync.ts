import { BrowserWindow, nativeTheme } from 'electron'
import { applyLoginItem, type ConfigManager } from '../config'
import {
  applyNativeThemeSource,
  type TrayManager,
  type WindowManager
} from '../modules/core'

/**
 * 配置变更 → 开机自启 / 主题 / 托盘 / 广播。
 * features.enabled 的热加载在 config:update → onFeaturesConfigChanged 中处理。
 */
export function wireConfigSync(deps: {
  config: ConfigManager
  windows: WindowManager
  tray: TrayManager
}): void {
  deps.config.onChanged = (next, prev) => {
    if (next.general.launchAtLogin !== prev.general.launchAtLogin) {
      applyLoginItem(next.general.launchAtLogin)
    }
    if (next.general.theme !== prev.general.theme) {
      applyNativeThemeSource(next.general.theme)
      deps.windows.panel.applyChromeTheme()
    }

    deps.tray.rebuild()
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('config:updated', next)
    }
  }

  nativeTheme.on('updated', () => {
    if (deps.config.get().general.theme === 'system') {
      deps.windows.panel.applyChromeTheme()
    }
  })
}
