import { globalShortcut } from 'electron'
import type { ShortcutConfig } from '@shared/types'

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
  return Boolean(accelerator) && /^[\x21-\x7E]+$/.test(accelerator)
}

export type ShortcutHandlers = {
  togglePanel: () => void
  screenshot: () => void
}

/**
 * 全局快捷键：同时管理剪贴板呼出与截屏。
 * 配置为空字符串时不注册该键（功能关闭）。
 */
export class ShortcutManager {
  private registered: Partial<Record<keyof ShortcutConfig, string>> = {}

  constructor(private handlers: ShortcutHandlers) {}

  /**
   * 按配置注册全部快捷键。
   * @returns 失败的键名列表
   */
  registerAll(shortcuts: ShortcutConfig): Array<keyof ShortcutConfig> {
    this.unregisterAll()
    const failed: Array<keyof ShortcutConfig> = []
    const used = new Set<string>()

    const entries: Array<[keyof ShortcutConfig, () => void]> = [
      ['togglePanel', this.handlers.togglePanel],
      ['screenshot', this.handlers.screenshot]
    ]

    for (const [key, handler] of entries) {
      const normalized = normalizeAccelerator(shortcuts[key])
      // 空字符串 = 主动关闭该快捷键，跳过注册且不算失败
      if (!normalized) continue
      if (!isUsableAccelerator(normalized)) {
        console.warn(`[shortcut] 非法快捷键 ${key}: ${JSON.stringify(shortcuts[key])}`)
        failed.push(key)
        continue
      }
      if (used.has(normalized)) {
        console.warn(`[shortcut] 与其它快捷键冲突: ${key}=${normalized}`)
        failed.push(key)
        continue
      }
      try {
        const ok = globalShortcut.register(normalized, handler)
        if (ok) {
          this.registered[key] = normalized
          used.add(normalized)
        } else {
          console.warn(`[shortcut] 注册失败（可能被占用）: ${key}=${normalized}`)
          failed.push(key)
        }
      } catch (err) {
        console.warn(`[shortcut] 注册异常: ${key}=${normalized}`, err)
        failed.push(key)
      }
    }
    return failed
  }

  getRegistered(key: keyof ShortcutConfig): string {
    return this.registered[key] ?? ''
  }

  unregisterAll(): void {
    globalShortcut.unregisterAll()
    this.registered = {}
  }
}
