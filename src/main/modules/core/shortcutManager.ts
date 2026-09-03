import { globalShortcut } from 'electron'

/**
 * 全局快捷键管理：注册表完全由 ShortcutConfig 驱动，可动态重注册
 */
export class ShortcutManager {
  private current = ''

  constructor(private onTogglePanel: () => void) {}

  /** 注册（或按新配置重注册）全局快捷键 */
  register(accelerator: string): boolean {
    globalShortcut.unregisterAll()
    this.current = ''
    if (!accelerator) return false
    const ok = globalShortcut.register(accelerator, this.onTogglePanel)
    if (ok) {
      this.current = accelerator
    } else {
      console.warn(`[shortcut] 注册失败（可能被占用）: ${accelerator}`)
    }
    return ok
  }

  get registered(): string {
    return this.current
  }

  unregisterAll(): void {
    globalShortcut.unregisterAll()
    this.current = ''
  }
}
