import type { ConfigManager } from '../config'
import type {
  ClipboardImageStore,
  ClipboardWatcher,
  FavoritesManager,
  HistoryManager,
  PasteService
} from '../modules/clipboard'
import type { ShortcutManager, TrayManager, WindowManager } from '../modules/core'
import type { ProjectsRuntime } from '../modules/projects'
import type { RecorderHost, RecorderSelectSession } from '../modules/recorder'
import type { ScreenshotSession } from '../modules/screenshot'

/** 录屏托盘 / 快捷键共用动作 */
export type RecorderActions = {
  startRegion: () => void
  startFullscreen: () => void
  pauseResume: () => void
  stop: () => void
}

/** ready 完成后的主进程服务图（lifecycle / quit 共用） */
export type AppContext = {
  config: ConfigManager
  windows: WindowManager
  shortcuts: ShortcutManager
  tray: TrayManager
  clipboardImages: ClipboardImageStore
  history: HistoryManager
  favorites: FavoritesManager
  paste: PasteService
  clipboardWatcher: ClipboardWatcher
  projects: ProjectsRuntime
  screenshot: ScreenshotSession
  recorderHost: RecorderHost
  recorderSelect: RecorderSelectSession
  recorderActions: RecorderActions
  startScreenshot: () => void
  quitApp: () => void
}
