import { defineFeature, type FeatureHandles } from '../feature'
import { assembleClipboard, type ClipboardStack } from './assemble'
import { createClipboardHostServices, type ClipboardHostServices } from './hostServices'
import { registerClipboardIpc } from './ipc'

/** clipboard Feature 的 setup 句柄 */
export type ClipboardFeatureHandles = FeatureHandles &
  ClipboardStack & {
    services: ClipboardHostServices
  }

/**
 * 剪贴板主进程 Feature
 * 贡献：lifecycle + IPC `history:*`/`favorite:*`/`clip:paste` + 快捷键 toggleClipboard
 * 对外：ClipboardHostServices（截屏入库）
 */
export const clipboardFeature = defineFeature({
  id: 'clipboard',
  setup(ctx): ClipboardFeatureHandles {
    const stack = assembleClipboard(ctx.config)
    const services = createClipboardHostServices(stack)
    // 供截屏等后续 Feature 经 ctx.shared 取用
    ctx.shared.clipboard = services
    return {
      ...stack,
      services,
      dispose: () => {
        stack.watcher.stop()
        stack.history.dispose()
        stack.favorites.dispose()
      }
    }
  },
  registerIpc(ctx, handles) {
    const h = handles as ClipboardFeatureHandles
    registerClipboardIpc({
      history: h.history,
      favorites: h.favorites,
      paste: h.paste,
      windows: ctx.windows
    })
  },
  bindShortcuts(ctx, _handles, gates) {
    return {
      toggleClipboard: () => {
        if (gates.isScreenshotActive()) return
        if (gates.isRecorderSelectActive()) return
        if (!ctx.windows.clipboard.isVisible()) {
          ctx.windows.noteForegroundBeforeShow()
        }
        ctx.windows.toggleClipboard()
      }
    }
  }
})
