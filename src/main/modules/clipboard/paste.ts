import { spawn } from 'child_process'
import { clipboard, nativeImage, shell, systemPreferences } from 'electron'
import type { ClipRecord } from '@shared/types'
import { simulateWindowsPasteKey } from '../core/windows/focusTarget'

/** 激活目标应用后、发粘贴键前的短等待（等焦点落地） */
const MAC_PRE_PASTE_DELAY_MS = 10
const WIN_PRE_PASTE_DELAY_MS = 80
/** 多条连续粘贴时，条目之间的间隔（最后一条不等待） */
const BETWEEN_PASTE_DELAY_MS = 100

/**
 * 粘贴服务：写入系统剪贴板 + 模拟粘贴按键
 */
export class PasteService {
  /** 自身写入剪贴板后回调，供监听器同步基线，避免二次入库/抢占剪贴板 */
  onClipboardWritten: (() => void) | null = null

  /** 复制单条内容到系统剪贴板 */
  copy(record: ClipRecord): void {
    if (record.type === 'text') {
      // write() 比 writeText 在 Windows 上更完整地注册 CF_UNICODETEXT
      clipboard.write({ text: record.text ?? '' })
    } else if (record.image) {
      const img = nativeImage.createFromBuffer(Buffer.from(record.image.base64, 'base64'))
      clipboard.write({ image: img })
    }
    this.onClipboardWritten?.()
  }

  /**
   * 依次写入并模拟粘贴，实现多条记录顺序粘贴
   */
  async paste(records: ClipRecord[]): Promise<boolean> {
    if (!records.length) return false

    if (process.platform === 'darwin' && !systemPreferences.isTrustedAccessibilityClient(false)) {
      this.openAccessibilitySettings()
      return false
    }

    for (let i = 0; i < records.length; i++) {
      const record = records[i]!
      this.copy(record)
      if (process.platform === 'darwin') {
        await delay(MAC_PRE_PASTE_DELAY_MS)
      } else if (process.platform === 'win32') {
        await delay(WIN_PRE_PASTE_DELAY_MS)
      }
      const ok = await this.simulatePasteKey()
      if (!ok) return false
      // 仅多条之间等待，最后一条立即返回，避免粘贴完成后卡住
      if (i < records.length - 1) {
        await delay(BETWEEN_PASTE_DELAY_MS)
      }
    }
    return true
  }

  /** 模拟 Cmd/Ctrl+V */
  private simulatePasteKey(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        if (process.platform === 'darwin') {
          const child = spawn('osascript', [
            '-e',
            'tell application "System Events" to keystroke "v" using command down'
          ])
          let stderr = ''
          child.stderr.on('data', (chunk) => {
            stderr += String(chunk)
          })
          child.on('error', () => resolve(false))
          child.on('exit', (code) => {
            if (isAccessibilityDenied(stderr)) {
              this.openAccessibilitySettings()
              resolve(false)
              return
            }
            resolve(code === 0)
          })
        } else if (process.platform === 'win32') {
          // SendKeys 在独立 powershell 进程里经常贴不到目标窗；改用 user32 keybd_event
          void simulateWindowsPasteKey().then(resolve)
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

  private openAccessibilitySettings(): void {
    if (process.platform === 'darwin') {
      systemPreferences.isTrustedAccessibilityClient(true)
      void shell.openExternal(
        'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
      )
    }
  }
}

function isAccessibilityDenied(stderr: string): boolean {
  const s = stderr.toLowerCase()
  return (
    s.includes('not allowed') ||
    s.includes('1002') ||
    s.includes('1743') ||
    s.includes('辅助功能') ||
    s.includes('accessibility')
  )
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
