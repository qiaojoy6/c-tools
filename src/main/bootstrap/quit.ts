import { app } from 'electron'
import type { AppContext } from './context'

let quitting = false

/** 退出前清理：按隐私清历史、FeatureHost.dispose（含截屏/录屏/剪贴板等） */
export function prepareQuit(ctx: AppContext | null): void {
  if (quitting || !ctx) return
  quitting = true

  const cfg = ctx.config.get()
  if (cfg.privacy.clearOnQuit) ctx.history?.clear()
  // Feature dispose：screenshot.cancel / recorder 收尾 / clipboard / projects / quickFolders
  void ctx.featureHost.disposeAll()
  ctx.windows.markQuitting()
}

export function quitApp(ctx: AppContext | null): void {
  prepareQuit(ctx)
  app.quit()
}
