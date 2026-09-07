import { app, clipboard, dialog, nativeImage, Notification, BrowserWindow } from 'electron'
import { writeFileSync } from 'fs'
import type { ClipboardImageStore } from '../clipboard/imageStore'
import type { HistoryManager } from '../clipboard/history'
import { delay } from '../core/windows/loadRoute'

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

/**
 * 另存为 PNG。
 * 须在截屏遮罩关闭后调用；用临时普通窗作 parent，避免 mac 上确定/回车失灵。
 */
export async function saveScreenshotPng(png: Buffer): Promise<boolean> {
  if (!png.byteLength) return false
  const stamp = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  const name = `screenshot-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}.png`

  const parent = new BrowserWindow({
    width: 320,
    height: 160,
    show: false,
    frame: true,
    transparent: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: '保存截图'
  })

  try {
    try {
      app.focus({ steal: true })
    } catch {
      /* ignore */
    }
    parent.setAlwaysOnTop(true, 'floating')
    parent.center()
    parent.show()
    parent.focus()
    await delay(32)

    const { canceled, filePath } = await dialog.showSaveDialog(parent, {
      title: '保存截图',
      defaultPath: name,
      filters: [{ name: 'PNG', extensions: ['png'] }]
    })
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
  } finally {
    if (!parent.isDestroyed()) parent.destroy()
  }
}
