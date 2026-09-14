import { dialog, Notification, type BrowserWindow } from 'electron'
import { writeFileSync } from 'fs'
import type { ClipboardHostServices } from '../clipboard'

export interface CompleteDeps {
  clipboard: ClipboardHostServices
}

/** 完成：委托剪贴板 HostServices 写板 + 入库 */
export function completeScreenshot(png: Buffer, deps: CompleteDeps): boolean {
  return deps.clipboard.ingestScreenshotPng(png)
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
