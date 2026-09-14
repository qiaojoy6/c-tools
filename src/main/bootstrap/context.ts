import type { ConfigManager } from '../config'
import type {
  ClipboardImageStore,
  ClipboardWatcher,
  FavoritesManager,
  HistoryManager,
  PasteService
} from '../modules/clipboard'
import type { QuickFoldersStore } from '../modules/quickFolders'
import type { ShortcutManager, TrayManager, WindowManager } from '../modules/core'
import type { FeatureHost } from '../modules/feature'
import type { ProjectsRuntime } from '../modules/projects'
import type { RecorderActions, RecorderHost, RecorderSelectSession } from '../modules/recorder'
import type { ScreenshotSession } from '../modules/screenshot'

export type { RecorderActions }

/** ready 完成后的主进程服务图（lifecycle / quit 共用）；Feature 可按配置禁用 */
export type AppContext = {
  config: ConfigManager
  windows: WindowManager
  shortcuts: ShortcutManager
  tray: TrayManager
  featureHost: FeatureHost
  clipboardImages?: ClipboardImageStore
  history?: HistoryManager
  favorites?: FavoritesManager
  paste?: PasteService
  clipboardWatcher?: ClipboardWatcher
  quickFolders?: QuickFoldersStore
  projects?: ProjectsRuntime
  screenshot?: ScreenshotSession
  recorderHost?: RecorderHost
  recorderSelect?: RecorderSelectSession
  recorderActions?: RecorderActions
  startScreenshot?: () => void
  quitApp: () => void
}
