import { defineFeature, type FeatureHandles } from '../feature'
import { QuickFoldersStore } from './store'
import { registerQuickFoldersIpc } from './ipc'

/** quickFolders Feature 的 setup 句柄 */
export type QuickFoldersFeatureHandles = FeatureHandles & {
  store: QuickFoldersStore
}

/**
 * 快捷文件夹主进程 Feature
 * 贡献：lifecycle（store）+ IPC `quickFolders:*` + 快捷键 toggleQuickFolders
 */
export const quickFoldersFeature = defineFeature({
  id: 'quickFolders',
  setup(ctx): QuickFoldersFeatureHandles {
    const store = new QuickFoldersStore(() => ctx.config.get().quickFolders.maxItems)
    store.init()
    return {
      store,
      dispose: () => {
        store.dispose()
      }
    }
  },
  registerIpc(ctx, handles) {
    registerQuickFoldersIpc({
      store: (handles as QuickFoldersFeatureHandles).store,
      windows: ctx.windows
    })
  },
  bindShortcuts(ctx, _handles, gates) {
    return {
      toggleQuickFolders: () => {
        if (gates.isScreenshotActive()) return
        if (gates.isRecorderSelectActive()) return
        // Win：与剪贴板一致，show 前同步记下前台 hwnd
        if (!ctx.windows.quickFolders.isVisible()) {
          ctx.windows.noteForegroundBeforeShow()
        }
        ctx.windows.toggleQuickFolders()
      }
    }
  }
})
