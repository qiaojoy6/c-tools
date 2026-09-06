import { clipboard, Notification, systemPreferences } from 'electron'
import type { ClipRecord } from '@shared/types'
import { simulatePasteKey } from '../core/windows/focusTarget'
import type { ClipboardImageStore } from './imageStore'

/** 多条连续粘贴时，条目之间的间隔（最后一条不等待） */
const BETWEEN_PASTE_DELAY_MS = 100

/**
 * 粘贴服务：写入系统剪贴板 + 模拟粘贴按键
 * 无辅助功能权限时只保证写入剪贴板，不模拟回填、不拉起系统设置
 * 按键模拟见 focusTarget/mac · focusTarget/win
 */
export class PasteService {
  /** 自身写入剪贴板后回调，供监听器同步基线，避免二次入库/抢占剪贴板 */
  onClipboardWritten: (() => void) | null = null

  constructor(private images: ClipboardImageStore) {}

  /** macOS：是否已授权辅助功能（可自动 ⌘V 回填）；其它平台视为可用 */
  canAutoPaste(): boolean {
    if (process.platform !== 'darwin') return true
    return systemPreferences.isTrustedAccessibilityClient(false)
  }

  /** 启动时若无辅助功能权限，提示一次（粘贴过程中不再重复弹） */
  notifyAccessibilityHintOnLaunch(): void {
    if (this.canAutoPaste()) return
    try {
      if (!Notification.isSupported()) return
      new Notification({
        title: 'c-tools',
        body: '未开启辅助功能：粘贴仅写入剪贴板，请到目标处手动 ⌘V'
      }).show()
    } catch {
      /* ignore */
    }
  }

  /** 复制单条内容到系统剪贴板 */
  copy(record: ClipRecord): void {
    if (record.type === 'text') {
      // write() 比 writeText 在 Windows 上更完整地注册 CF_UNICODETEXT
      clipboard.write({ text: record.text ?? '' })
    } else if (record.image) {
      const img = this.images.toNativeImage(record.image.fileId)
      if (!img) return
      clipboard.write({ image: img })
    }
    this.onClipboardWritten?.()
  }

  /**
   * 依次写入并模拟粘贴，实现多条记录顺序粘贴。
   * 无权限时返回 false（调用方已 copy；权限提示仅在启动时弹出）。
   */
  async paste(records: ClipRecord[]): Promise<boolean> {
    if (!records.length) return false

    // 拒绝/未授权：不回填、不弹系统设置（内容由 clip:paste 先行写入剪贴板）
    if (!this.canAutoPaste()) {
      return false
    }

    for (let i = 0; i < records.length; i++) {
      const record = records[i]!
      this.copy(record)
      const ok = await simulatePasteKey()
      if (!ok) return false
      // 仅多条之间等待，最后一条立即返回，避免粘贴完成后卡住
      if (i < records.length - 1) {
        await delay(BETWEEN_PASTE_DELAY_MS)
      }
    }
    return true
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
