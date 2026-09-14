import { defineFeature, type FeatureHandles } from '../feature'
import type { ClipboardHostServices } from '../clipboard'
import { trayMenuItem } from '../core'
import { ScreenshotSession } from './session'
import { registerScreenshotIpc } from './ipc'
import { installScreenshotImageProtocol } from './protocol'

/** screenshot Feature 的 setup 句柄 */
export type ScreenshotFeatureHandles = FeatureHandles & {
  session: ScreenshotSession
  startScreenshot: () => void
}

/**
 * 截屏主进程 Feature
 * 贡献：lifecycle + IPC `screenshot:*` + 快捷键 screenshot
 * 依赖：ctx.shared.clipboard（须先注册 clipboard Feature）
 */
export const screenshotFeature = defineFeature({
  id: 'screenshot',
  setup(ctx): ScreenshotFeatureHandles {
    const clipboard = ctx.shared.clipboard as ClipboardHostServices | undefined
    if (!clipboard) {
      throw new Error('screenshotFeature: ctx.shared.clipboard missing (register clipboard first)')
    }

    installScreenshotImageProtocol()

    const session = new ScreenshotSession({
      getConfig: () => ctx.config.get(),
      clipboard,
      hideAppWindows: () => ctx.windows.captureAndHideAppWindows(),
      captureExternalFocus: () => ctx.windows.captureScreenshotExternalFocus(),
      settleAfterScreenshot: (opts) => ctx.windows.settleAfterScreenshot(opts)
    })

    // 回填互斥闸门，供录屏 / 其它 Feature 调用时读取
    ctx.shared.isScreenshotActive = () => session.isActive

    const startScreenshot = (): void => {
      if (ctx.shared.isRecorderSelectActive?.()) return
      void session.start()
    }

    // 延后预热：避免热加载时在 config:update 同步路径里建窗抢焦点
    setImmediate(() => {
      session.prewarm()
    })

    return {
      session,
      startScreenshot,
      dispose: () => {
        session.cancel()
      }
    }
  },
  registerIpc(_ctx, handles) {
    registerScreenshotIpc((handles as ScreenshotFeatureHandles).session)
  },
  bindShortcuts(_ctx, handles, gates) {
    const h = handles as ScreenshotFeatureHandles
    return {
      screenshot: () => {
        if (gates.isRecorderSelectActive()) return
        h.startScreenshot()
      }
    }
  },
  bindTray(_ctx, handles) {
    const h = handles as ScreenshotFeatureHandles
    return {
      order: 10,
      items: (menuCtx) => [
        trayMenuItem('截屏', () => h.startScreenshot(), menuCtx.shortcuts.screenshot)
      ]
    }
  }
})
