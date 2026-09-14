import type { ConfigManager } from '../config'
import { TrayManager, type WindowManager } from '../modules/core'
import type { RecorderHost } from '../modules/recorder'
import type { RecorderActions } from './context'

export type TraySetupDeps = {
  config: ConfigManager
  windows: WindowManager
  recorderHost: RecorderHost
  startScreenshot: () => void
  recorderActions: RecorderActions
  openSettings: () => void
  quit: () => void
}

/** 创建托盘并绑定面板 / 截屏 / 录屏入口 */
export function setupTray(deps: TraySetupDeps): TrayManager {
  const tray = new TrayManager(
    () => {
      const rs = deps.recorderHost.status().state
      const recordingState = rs === 'recording' || rs === 'paused' ? rs : ('idle' as const)
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
      startScreenshot: deps.startScreenshot,
      startRegionRecord: () => {
        deps.recorderActions.startRegion()
      },
      startFullscreenRecord: () => {
        deps.recorderActions.startFullscreen()
      },
      stopRecord: () => {
        deps.recorderActions.stop()
      },
      togglePauseRecord: () => {
        deps.recorderActions.pauseResume()
      },
      toggleLogin: () => {
        const enabled = !deps.config.get().general.launchAtLogin
        deps.config.update({ general: { launchAtLogin: enabled } })
      },
      quit: deps.quit
    }
  )
  tray.create()
  return tray
}
