import { clipboard, dialog, nativeImage, Notification, type BrowserWindow } from 'electron'
import { writeFileSync } from 'fs'
import type { ClipboardImageStore } from '../clipboard/imageStore'
import type { HistoryManager } from '../clipboard/history'

export interface CompleteDeps {
  images: ClipboardImageStore
  history: HistoryManager
  /** 写入系统剪贴板后同步监听基线 */
  syncBaseline: () => void
}

/** 完成：写系统剪贴板 + 入库历史 */
export function completeScreenshot(png: Buffer, deps: CompleteDeps): boolean {
  if (!png.byteLength) return false
  const img = nativeImage.createFromBuffer(png)
  if (img.isEmpty()) return false
  const { width, height } = img.getSize()

  clipboard.write({ image: img })
  deps.syncBaseline()

  const meta = deps.images.saveBuffer(png, 'png')
  deps.history.add({
    type: 'image',
    image: { ...meta, width, height }
  })
  return true
}

/** 下载 PNG：在截屏遮罩上弹系统保存对话框（parent 保证 mac 上确定/回车可用） */
export async function saveScreenshotPng(
  png: Buffer,
  parent?: BrowserWindow
): Promise<boolean> {
  if (!png.byteLength) return false
  const stamp = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  const name = `c-tools-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}.png`

  const opts = {
    title: '下载截图',
    defaultPath: name,
    filters: [{ name: 'PNG', extensions: ['png'] }]
  }
  const result = parent
    ? await dialog.showSaveDialog(parent, opts)
    : await dialog.showSaveDialog(opts)
  const { canceled, filePath } = result
  if (canceled || !filePath) return false

  writeFileSync(filePath, png)
  try {
    if (Notification.isSupported()) {
      new Notification({ title: 'c-tools', body: '截图已保存' }).show()
    }
  } catch {
    /* ignore */
  }
  return true
}
