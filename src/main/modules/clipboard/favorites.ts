import { randomUUID } from 'crypto'
import { app } from 'electron'
import { join } from 'path'
import type { ClipRecord } from '@shared/types'
import { JsonStore } from '../core/storage'

interface FavoritesFile {
  version: 1
  records: ClipRecord[]
}

/**
 * 收藏：独立于历史列表持久化。
 * 收藏后与历史解耦，历史删除/清空/过期不影响收藏；取消收藏即删除该条。
 * 图片与历史共享磁盘文件（同 fileId）；两边都不再引用时才物理删除。
 */
export class FavoritesManager {
  private records: ClipRecord[] = []
  private store: JsonStore<FavoritesFile>
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private onUpdate: (records: ClipRecord[]) => void,
    private reconcileImages: () => void
  ) {
    this.store = new JsonStore<FavoritesFile>(
      join(app.getPath('userData'), 'clipboard-favorites.json')
    )
  }

  init(): void {
    const data = this.store.read()
    this.records = data?.records ?? []
  }

  getAll(): ClipRecord[] {
    return this.records
  }

  get(id: string): ClipRecord | undefined {
    return this.records.find((r) => r.id === id)
  }

  referencedFileIds(): string[] {
    return this.records.filter((r) => r.image?.fileId).map((r) => r.image!.fileId)
  }

  /** 从历史记录拷贝一份到收藏（新 id，内容去重；图片复用同一 fileId） */
  addFrom(source: ClipRecord): boolean {
    if (this.records.some((r) => this.isSameContent(r, source))) {
      return false
    }

    const record: ClipRecord = {
      id: randomUUID(),
      type: source.type,
      text: source.text,
      image: source.image
        ? {
            fileId: source.image.fileId,
            width: source.image.width,
            height: source.image.height,
            byteLength: source.image.byteLength,
            hash: source.image.hash
          }
        : null,
      createdAt: Date.now()
    }

    this.records.unshift(record)
    this.scheduleSave()
    this.onUpdate(this.records)
    return true
  }

  /** 取消收藏 = 删除该条；若历史也不再引用该图则删文件 */
  remove(id: string): void {
    const idx = this.records.findIndex((r) => r.id === id)
    if (idx < 0) return
    this.records.splice(idx, 1)
    this.scheduleSave()
    this.reconcileImages()
    this.onUpdate(this.records)
  }

  dispose(): void {
    this.flushSave()
  }

  private isSameContent(a: ClipRecord, b: ClipRecord): boolean {
    if (a.type !== b.type) return false
    if (a.type === 'text') return a.text === b.text
    return Boolean(a.image && b.image && a.image.hash === b.image.hash)
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
