import type { ConfigManager } from '../config'
import type { WindowManager } from '../modules/core'
import type { ClipboardImageStore, ClipboardWatcher, HistoryManager } from '../modules/clipboard'
import { ScreenshotSession } from '../modules/screenshot'

export type ScreenshotSetupDeps = {
  config: ConfigManager
  windows: WindowManager
  images: ClipboardImageStore
  history: HistoryManager
  watcher: ClipboardWatcher
  /** 录屏框选进行中则不可开截屏 */
  isRecorderSelectActive: () => boolean
}

/** 创建截屏会话，并返回带互斥守卫的启动函数 */
export function setupScreenshot(deps: ScreenshotSetupDeps): {
  session: ScreenshotSession
  startScreenshot: () => void
} {
  const session = new ScreenshotSession({
    getConfig: () => deps.config.get(),
    images: deps.images,
    history: deps.history,
    syncBaseline: () => deps.watcher.syncBaseline(),
    hideAppWindows: () => deps.windows.captureAndHideAppWindows(),
    captureExternalFocus: () => deps.windows.captureScreenshotExternalFocus(),
    settleAfterScreenshot: (opts) => deps.windows.settleAfterScreenshot(opts)
  })

  const startScreenshot = (): void => {
    if (deps.isRecorderSelectActive()) return
    void session.start()
  }

  return { session, startScreenshot }
}
