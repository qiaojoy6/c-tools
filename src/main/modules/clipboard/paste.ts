import { execFile, spawn } from 'child_process'
import { clipboard, nativeImage } from 'electron'
import type { ClipRecord } from '../../../shared/types'

const PASTE_DELAY_MS = 220

/**
 * 粘贴服务：写入系统剪贴板 + 模拟粘贴按键
 */
export class PasteService {
  /** 复制单条内容到系统剪贴板 */
  copy(record: ClipRecord): void {
    if (record.type === 'text') {
      clipboard.writeText(record.text ?? '')
      return
    }
    if (record.image) {
      const img = nativeImage.createFromBuffer(Buffer.from(record.image.base64, 'base64'))
      clipboard.writeImage(img)
    }
  }

  /**
   * 依次写入并模拟粘贴，实现多条记录顺序粘贴
   */
  async paste(records: ClipRecord[]): Promise<boolean> {
    if (!records.length) return false
    for (const record of records) {
      this.copy(record)
      const ok = await this.simulatePasteKey()
      if (!ok) return false
      await delay(PASTE_DELAY_MS)
    }
    return true
  }

  /** 模拟 Cmd/Ctrl+V */
  private simulatePasteKey(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        if (process.platform === 'darwin') {
          execFile(
            'osascript',
            ['-e', 'tell application "System Events" to keystroke "v" using command down'],
            (err) => resolve(!err)
          )
        } else if (process.platform === 'win32') {
          const child = spawn(
            'powershell.exe',
            [
              '-NoProfile',
              '-NonInteractive',
              '-Command',
              'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("^v")'
            ],
            { windowsHide: true }
          )
          child.on('error', () => resolve(false))
          child.on('exit', (code) => resolve(code === 0))
        } else {
          const child = spawn('xdotool', ['key', '--clearmodifiers', 'ctrl+v'])
          child.on('error', () => resolve(false))
          child.on('exit', (code) => resolve(code === 0))
        }
      } catch {
        resolve(false)
      }
    })
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
