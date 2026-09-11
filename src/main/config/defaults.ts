import type { AppConfig } from '@shared/types'
import { DEFAULT_TOGGLE_PANEL_SHORTCUT } from '@shared/config'
import {
  defaultRecorderFullscreenShortcut,
  defaultRecorderRegionShortcut
} from '@shared/modules/recorder'
import { defaultScreenshotShortcut } from '@shared/modules/screenshot'

/**
 * 默认配置（Source of Truth）
 * 用户配置存储于 userData/settings.json，与本默认值深度合并后生效。
 */
export const DEFAULT_CONFIG: AppConfig = {
  window: {
    width: 760,
    height: 520,
    minWidth: 640,
    minHeight: 440,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    topOffset: 72,
    hideOnBlur: true
  },
  shortcuts: {
    togglePanel: DEFAULT_TOGGLE_PANEL_SHORTCUT,
    screenshot: defaultScreenshotShortcut(),
    recorderRegion: defaultRecorderRegionShortcut(),
    recorderFullscreen: defaultRecorderFullscreenShortcut()
  },
  clipboard: {
    pollIntervalMs: 500,
    maxRecords: 100,
    autoCleanDays: 0
  },
  screenshot: {
    hideAppWindows: true
  },
  projects: {
    workspaceRoot: null,
    overrides: {}
  },
  privacy: {
    clearOnQuit: false,
    clearOnStart: false
  },
  general: {
    launchAtLogin: false,
    theme: 'system'
  },
  recorder: {
    fullscreenFloatPos: null,
    enableMic: true,
    enableSystemAudio: true,
    micDeviceId: null,
    quality: 'original'
  }
}
