import { basename, dirname, extname, join } from 'path'
import { copyFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from 'fs'
import { app, BrowserWindow, dialog, Notification } from 'electron'

/**
 * 停录后弹系统「另存为」；确认则挪到目标路径，取消则删除临时成片不保存。
 * @returns 最终路径；取消或失败返回 null
 */
export async function promptSaveRecording(sourcePath: string): Promise<string | null> {
  const src = sourcePath.trim()
  if (!src || !existsSync(src)) return null

  const defaultName = basename(src) || defaultRecordingName()
  const opts = {
    title: '保存录屏',
    defaultPath: join(app.getPath('downloads'), defaultName),
    filters: [{ name: 'MP4 视频', extensions: ['mp4'] }]
  }

  // 勿挂录屏遮罩/悬浮条作 parent，否则对话框关闭后会把父窗重新显示出来
  const parent = pickSaveDialogParent()
  const { canceled, filePath } = parent
    ? await dialog.showSaveDialog(parent, opts)
    : await dialog.showSaveDialog(opts)

  if (canceled || !filePath?.trim()) {
    discardRecording(src)
    return null
  }

  let dest = filePath.trim()
  if (extname(dest).toLowerCase() !== '.mp4') {
    dest = `${dest}.mp4`
  }

  if (dest === src) {
    notifySaved(dest)
    return dest
  }

  try {
    const dir = dirname(dest)
    if (dir && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    try {
      renameSync(src, dest)
    } catch {
      // 跨卷 rename 失败时拷贝再删源
      copyFileSync(src, dest)
      discardRecording(src)
    }
    notifySaved(dest)
    return dest
  } catch (err) {
    console.error('[recorder] save as failed:', err)
    dialog.showErrorBox(
      '保存录屏失败',
      err instanceof Error ? err.message : String(err)
    )
    return null
  }
}

/** 只选普通应用窗（面板/设置等），跳过录屏工具窗 */
function pickSaveDialogParent(): BrowserWindow | undefined {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || !win.isVisible()) continue
    const title = (win.getTitle() || '').toLowerCase()
    if (title.includes('recorder')) continue
    // 录屏遮罩 / 外框 / 悬浮条均为 alwaysOnTop + 透明工具窗
    if (win.isAlwaysOnTop()) continue
    return win
  }
  return undefined
}

/** 取消保存时删掉临时成片 */
function discardRecording(path: string): void {
  try {
    if (existsSync(path)) unlinkSync(path)
  } catch (err) {
    console.warn('[recorder] discard failed:', err)
  }
}

function defaultRecordingName(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `recording-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.mp4`
}

function notifySaved(path: string): void {
  try {
    if (Notification.isSupported()) {
      new Notification({ title: 'c-tools', body: `录屏已保存\n${path}` }).show()
    }
  } catch {
    /* ignore */
  }
}
