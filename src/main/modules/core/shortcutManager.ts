import { globalShortcut } from 'electron'

/**
 * 规范化加速键：历史错误可能把空格存成字面量 " "（如 "Alt+ "）
 */
export function normalizeAccelerator(raw: string): string {
  if (!raw) return ''
  return raw
    .split('+')
    .map((part) => {
      if (part === ' ' || part === '' || /^\s+$/.test(part)) return 'Space'
      return part.trim()
    })
    .filter(Boolean)
    .join('+')
}

function isUsableAccelerator(accelerator: string): boolean {
  // Electron 要求纯 ASCII，且不能含空白
  return Boolean(accelerator) && /^[\x21-\x7E]+$/.test(accelerator)
}

/**
 * 全局快捷键管理：注册表完全由 ShortcutConfig 驱动，可动态重注册
 */
export class ShortcutManager {
  private current = ''

  constructor(private onTogglePanel: () => void) {}

  /** 注册（或按新配置重注册）全局快捷键；非法字符串返回 false，不抛错 */
  register(accelerator: string): boolean {
    globalShortcut.unregisterAll()
    this.current = ''

    const normalized = normalizeAccelerator(accelerator)
    if (!isUsableAccelerator(normalized)) {
      console.warn(`[shortcut] 非法快捷键，已忽略: ${JSON.stringify(accelerator)}`)
      return false
    }

    try {
      const ok = globalShortcut.register(normalized, this.onTogglePanel)
      if (ok) {
        this.current = normalized
      } else {
        console.warn(`[shortcut] 注册失败（可能被占用）: ${normalized}`)
      }
      return ok
    } catch (err) {
      console.warn(`[shortcut] 注册异常: ${normalized}`, err)
      return false
    }
  }

  get registered(): string {
    return this.current
  }

  unregisterAll(): void {
    globalShortcut.unregisterAll()
    this.current = ''
  }
}
