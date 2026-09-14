import { DEFAULT_CONFIG, type ConfigManager } from '../config'
import { ShortcutManager, normalizeAccelerator, type WindowManager } from '../modules/core'
import type { ScreenshotSession } from '../modules/screenshot'
import type { RecorderSelectSession } from '../modules/recorder'
import type { RecorderActions } from './context'

export type ShortcutSetupDeps = {
  config: ConfigManager
  windows: WindowManager
  screenshot: ScreenshotSession
  recorderSelect: RecorderSelectSession
  startScreenshot: () => void
  recorderActions: RecorderActions
}

/** 规范化配置中的快捷键并注册；失败则回退默认 */
export function setupShortcuts(deps: ShortcutSetupDeps): ShortcutManager {
  const { config, windows, screenshot, recorderSelect, startScreenshot, recorderActions } = deps

  const manager = new ShortcutManager({
    toggleClipboard: () => {
      if (screenshot.isActive) return
      if (recorderSelect.isActive) return
      if (!windows.clipboard.isVisible()) {
        windows.noteForegroundBeforeShow()
      }
      windows.toggleClipboard()
    },
    toggleQuickFolders: () => {
      if (screenshot.isActive) return
      if (recorderSelect.isActive) return
      windows.toggleQuickFolders()
    },
    screenshot: () => {
      if (recorderSelect.isActive) return
      startScreenshot()
    },
    recorderRegion: () => {
      recorderActions.startRegion()
    },
    recorderFullscreen: () => {
      recorderActions.startFullscreen()
    },
    recorderPauseResume: () => {
      recorderActions.pauseResume()
    },
    recorderStop: () => {
      recorderActions.stop()
    }
  })

  const cfg = config.get()
  const nextShortcuts = {
    toggleClipboard: normalizeAccelerator(cfg.shortcuts.toggleClipboard),
    toggleQuickFolders: normalizeAccelerator(cfg.shortcuts.toggleQuickFolders ?? ''),
    screenshot: normalizeAccelerator(cfg.shortcuts.screenshot),
    recorderRegion: normalizeAccelerator(cfg.shortcuts.recorderRegion ?? ''),
    recorderFullscreen: normalizeAccelerator(cfg.shortcuts.recorderFullscreen ?? ''),
    recorderPauseResume: normalizeAccelerator(cfg.shortcuts.recorderPauseResume ?? ''),
    recorderStop: normalizeAccelerator(cfg.shortcuts.recorderStop ?? '')
  }
  if (
    nextShortcuts.toggleClipboard !== cfg.shortcuts.toggleClipboard ||
    nextShortcuts.toggleQuickFolders !== (cfg.shortcuts.toggleQuickFolders ?? '') ||
    nextShortcuts.screenshot !== cfg.shortcuts.screenshot ||
    nextShortcuts.recorderRegion !== (cfg.shortcuts.recorderRegion ?? '') ||
    nextShortcuts.recorderFullscreen !== (cfg.shortcuts.recorderFullscreen ?? '') ||
    nextShortcuts.recorderPauseResume !== (cfg.shortcuts.recorderPauseResume ?? '') ||
    nextShortcuts.recorderStop !== (cfg.shortcuts.recorderStop ?? '')
  ) {
    config.update({ shortcuts: nextShortcuts })
  }

  const failed = manager.registerAll(config.get().shortcuts)
  if (failed.length) {
    config.update({ shortcuts: DEFAULT_CONFIG.shortcuts })
    manager.registerAll(DEFAULT_CONFIG.shortcuts)
  }

  windows.onSettingsClosed = () => {
    manager.registerAll(config.get().shortcuts)
  }

  return manager
}
