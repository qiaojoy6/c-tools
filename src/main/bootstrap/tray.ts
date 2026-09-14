import type { ConfigManager } from '../config'
import { TrayManager, type WindowManager } from '../modules/core'
import type { FeatureHost } from '../modules/feature'
import type { RecorderHost } from '../modules/recorder'

export type TraySetupDeps = {
  config: ConfigManager
  windows: WindowManager
  featureHost: FeatureHost
  /** 录屏 host：仅用于托盘菜单录制状态；未启用 recorder 时可不传 */
  recorderHost?: RecorderHost
  openSettings: () => void
  quit: () => void
}

/** 创建托盘：壳层动作 + Feature 托盘贡献 */
export function setupTray(deps: TraySetupDeps): TrayManager {
  const tray = new TrayManager(
    () => {
      const rs = deps.recorderHost?.status().state
      const recordingState =
        rs === 'recording' || rs === 'paused' ? rs : ('idle' as const)
      const cfg = deps.config.get()
      return {
        launchAtLogin: cfg.general.launchAtLogin,
        recordingState,
        shortcuts: cfg.shortcuts
      }
    },
    {
      showPanel: () => deps.windows.showPanel(),
      togglePanel: () => deps.windows.togglePanel(),
      openSettings: deps.openSettings,
      toggleLogin: () => {
        const enabled = !deps.config.get().general.launchAtLogin
        deps.config.update({ general: { launchAtLogin: enabled } })
      },
      quit: deps.quit
    },
    () => deps.featureHost.collectTrayContributions()
  )
  tray.create()
  return tray
}
