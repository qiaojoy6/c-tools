import type { AppContext } from './context'
import { prepareQuit } from './quit'
import { app } from 'electron'

/** 挂载 activate / 退出相关监听（ctx 在 whenReady 后才有） */
export function attachAppLifecycle(getCtx: () => AppContext | null): void {
  app.on('activate', () => {
    const ctx = getCtx()
    if (!ctx) return
    // 截屏 / 录屏框选中或刚结束还焦时勿抬起功能面板
    if (ctx.screenshot?.blocksPanelActivate) return
    if (ctx.recorderSelect?.blocksPanelActivate) return
    ctx.windows.showPanel({ captureFocus: false })
  })

  app.on('window-all-closed', () => {})
  app.on('before-quit', () => prepareQuit(getCtx()))
  app.on('will-quit', () => getCtx()?.shortcuts.unregisterAll())
}
