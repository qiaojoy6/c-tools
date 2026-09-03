import { randomUUID } from 'crypto'
import { app } from 'electron'
import { join } from 'path'
import type { AppConfig, ClipRecord } from '../../../shared/types'
import { JsonStore } from '../core/storage'

interface HistoryFile {
  version: 1
  records: ClipRecord[]
}

interface Capture {
  type: 'text' | 'image'
  text?: string
  base64?: string
  width?: number
  height?: number
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 剪贴历史管理：去重、置顶、裁剪、过期清理、持久化
 */
export class HistoryManager {
  private records: ClipRecord[] = []
  private store: JsonStore<HistoryFile>
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private getConfig: () => AppConfig,
    private onUpdate: (records: ClipRecord[]) => void
  ) {
    this.store = new JsonStore<HistoryFile>(join(app.getPath('userData'), 'clipboard-history.json'))
  }

  /** 启动时加载 */
  init(): void {
    const privacy = this.getConfig().privacy
    const data = this.store.read()
    this.records = data?.records ?? []
    if (privacy.clearOnStart && this.records.length > 0) {
      this.records = []
      this.flushSave()
    }
    this.cleanExpired()
  }

  getAll(): ClipRecord[] {
    return this.records
  }

  get(id: string): ClipRecord | undefined {
    return this.records.find((r) => r.id === id)
  }

  /** 新增记录：连续重复仅保留最新一条（去重并置顶） */
  add(capture: Capture): void {
    if (capture.type === 'text') {
      if (!capture.text || !capture.text.trim()) return
    } else if (!capture.base64) return

    const exists = this.records.findIndex((r) => this.isSame(r, capture))
    if (exists >= 0) this.records.splice(exists, 1)

    const record: ClipRecord = {
      id: randomUUID(),
      type: capture.type,
      text: capture.type === 'text' ? (capture.text ?? null) : null,
      image:
        capture.type === 'image'
          ? {
              base64: capture.base64 ?? '',
              width: capture.width ?? 0,
              height: capture.height ?? 0
            }
          : null,
      createdAt: Date.now()
    }

    this.records.unshift(record)
    this.trim()
    this.scheduleSave()
    this.onUpdate(this.records)
  }

  /** 使用记录：刷新时间戳并置顶（复制/粘贴时调用），保持按最近使用排序 */
  touch(ids: string[]): void {
    let changed = false
    for (const id of ids) {
      const idx = this.records.findIndex((r) => r.id === id)
      if (idx < 0) continue
      const [record] = this.records.splice(idx, 1)
      record.createdAt = Date.now()
      this.records.unshift(record)
      changed = true
    }
    if (changed) {
      this.scheduleSave()
      this.onUpdate(this.records)
    }
  }

  remove(id: string): void {
    const idx = this.records.findIndex((r) => r.id === id)
    if (idx >= 0) {
      this.records.splice(idx, 1)
      this.scheduleSave()
      this.onUpdate(this.records)
    }
  }

  clear(): void {
    this.records = []
    this.flushSave()
    this.onUpdate(this.records)
  }

  /** 按配置裁剪条数上限并清理过期记录 */
  applyConfigChanged(): void {
    this.trim()
    this.cleanExpired()
  }

  /** 退出前立即持久化 */
  dispose(): void {
    this.flushSave()
  }

  private trim(): void {
    const max = Math.min(200, Math.max(1, this.getConfig().clipboard.maxRecords))
    if (this.records.length > max) this.records.length = max
  }

  private cleanExpired(): void {
    const days = this.getConfig().clipboard.autoCleanDays
    if (!days || days <= 0) return
    const threshold = Date.now() - days * DAY_MS
    const before = this.records.length
    this.records = this.records.filter((r) => r.createdAt >= threshold)
    if (this.records.length !== before) {
      this.flushSave()
      this.onUpdate(this.records)
    }
  }

  private isSame(record: ClipRecord, capture: Capture): boolean {
    if (record.type !== capture.type) return false
    if (capture.type === 'text') return record.text === capture.text
    return record.image?.base64 === capture.base64
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.flushSave(), 400)
  }

  private flushSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    this.store.write({ version: 1, records: this.records })
  }
}
