import { clipboard, nativeImage } from 'electron'
import type { ClipboardStack } from './assemble'

/**
 * 剪贴板对外服务（截屏等模块只依赖此面，不摸 HistoryManager / ImageStore）
 */
export type ClipboardHostServices = {
  /** 截屏完成：写系统剪贴板、同步监听基线、入库历史 */
  ingestScreenshotPng: (png: Buffer) => boolean
}

export function createClipboardHostServices(stack: ClipboardStack): ClipboardHostServices {
  return {
    ingestScreenshotPng(png) {
      if (!png.byteLength) return false
      const img = nativeImage.createFromBuffer(png)
      if (img.isEmpty()) return false
      const { width, height } = img.getSize()

      clipboard.write({ image: img })
      stack.watcher.syncBaseline()

      const meta = stack.images.saveBuffer(png, 'png')
      stack.history.add({
        type: 'image',
        image: { ...meta, width, height }
      })
      return true
    }
  }
}
