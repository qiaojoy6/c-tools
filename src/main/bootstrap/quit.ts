import { app } from 'electron'
import type { AppContext } from './context'

let quitting = false

/** 退出前清理：取消截屏/录屏、按隐私清历史、停项目服务 */
export function prepareQuit(ctx: AppContext | null): void {
  if (quitting || !ctx) return
  quitting = true
  ctx.screenshot.cancel()
  ctx.recorderSelect.hideRecordingBorder()
  ctx.recorderSelect.cancel()
  ctx.recorderHost.dispose()

  const cfg = ctx.config.get()
  if (cfg.privacy.clearOnQuit) ctx.history.clear()
  ctx.history.dispose()
  ctx.favorites.dispose()
  ctx.clipboardWatcher.stop()
  void ctx.projects.stopAll()
  ctx.windows.markQuitting()
}

export function quitApp(ctx: AppContext | null): void {
  prepareQuit(ctx)
  app.quit()
}
