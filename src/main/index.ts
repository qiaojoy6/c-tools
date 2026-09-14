/**
 * 主进程入口：单实例 → 协议 → ready 组装 → 生命周期。
 * 业务编排见 bootstrap/；能力实现见 modules/*。
 */
import { app } from 'electron'
import { installCrashGuard } from './modules/core'
import { registerAllCustomSchemes } from './modules/core/schemes'
import { attachAppLifecycle, runWhenReady, type AppContext } from './bootstrap'

// 自定义协议须在 ready 前一次性注册（不可分两次调用）
registerAllCustomSchemes()

let appCtx: AppContext | null = null

const gotSingleLock = app.requestSingleInstanceLock()

if (!gotSingleLock) {
  app.quit()
} else {
  installCrashGuard()

  app.on('second-instance', () => appCtx?.windows.showPanel())

  app.whenReady().then(() => {
    appCtx = runWhenReady()
  })

  attachAppLifecycle(() => appCtx)
}
