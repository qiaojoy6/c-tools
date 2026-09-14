import { randomUUID } from 'crypto'
import { existsSync, statSync } from 'fs'
import { basename, join, normalize, resolve } from 'path'
import { app } from 'electron'
import type { QuickFolderItem, QuickFolderMutationResult, QuickFolderRecord } from '@shared/types'
import { JsonStore } from '../core/storage'

interface QuickFoldersFile {
  version: 1
  records: QuickFolderRecord[]
}

/** 路径唯一性：解析为绝对路径；Windows 下忽略大小写 */
export function normalizeFolderPath(raw: string): string {
  const trimmed = raw.trim().replace(/^["']|["']$/g, '')
  if (!trimmed) return ''
  const abs = resolve(normalize(trimmed))
  return process.platform === 'win32' ? abs.toLowerCase() : abs
}

/** 展示用文件夹名 */
export function folderDisplayName(folderPath: string): string {
  const name = basename(folderPath)
  return name || folderPath
}

function isExistingDirectory(folderPath: string): boolean {
  try {
    return existsSync(folderPath) && statSync(folderPath).isDirectory()
  } catch {
    return false
  }
}

/**
 * 快捷文件夹列表：独立 JSON 持久化，数组顺序即展示顺序（新加 unshift；拖拽重写）。
 */
export class QuickFoldersStore {
  private records: QuickFolderRecord[] = []
  private store: JsonStore<QuickFoldersFile>
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private onUpdate: ((items: QuickFolderItem[]) => void) | null = null

  constructor(private getMaxItems: () => number) {
    this.store = new JsonStore<QuickFoldersFile>(
      join(app.getPath('userData'), 'quick-folders.json')
    )
  }

  /** 列表变更时推送给渲染进程 */
  setOnUpdate(handler: (items: QuickFolderItem[]) => void): void {
    this.onUpdate = handler
  }

  init(): void {
    const data = this.store.read()
    this.records = data?.records ?? []
  }

  list(): QuickFolderItem[] {
    return this.records.map((r) => this.toItem(r))
  }

  get(id: string): QuickFolderRecord | undefined {
    return this.records.find((r) => r.id === id)
  }

  /** 添加：必须已存在的目录；路径唯一；受上限约束 */
  add(rawPath: string, note = ''): QuickFolderMutationResult {
    const folderPath = resolve(normalize(rawPath.trim().replace(/^["']|["']$/g, '')))
    if (!folderPath) return { ok: false, error: '路径不能为空' }
    if (!isExistingDirectory(folderPath)) {
      return { ok: false, error: '路径必须是已存在的文件夹' }
    }
    const key = normalizeFolderPath(folderPath)
    if (this.records.some((r) => normalizeFolderPath(r.path) === key)) {
      return { ok: false, error: '该路径已存在' }
    }
    const max = this.getMaxItems()
    if (this.records.length >= max) {
      return { ok: false, error: `最多保存 ${max} 条` }
    }

    const now = Date.now()
    const record: QuickFolderRecord = {
      id: randomUUID(),
      path: folderPath,
      note: note.trim(),
      createdAt: now,
      updatedAt: now
    }
    this.records.unshift(record)
    this.scheduleSave()
    this.emit()
    return { ok: true, item: this.toItem(record) }
  }

  /** 更新备注与/或路径；无效项不可改（由调用方拦截，此处再校验存在性） */
  update(id: string, patch: { path?: string; note?: string }): QuickFolderMutationResult {
    const idx = this.records.findIndex((r) => r.id === id)
    if (idx < 0) return { ok: false, error: '记录不存在' }
    const current = this.records[idx]!

    let nextPath = current.path
    if (patch.path !== undefined) {
      nextPath = resolve(normalize(patch.path.trim().replace(/^["']|["']$/g, '')))
      if (!nextPath) return { ok: false, error: '路径不能为空' }
      if (!isExistingDirectory(nextPath)) {
        return { ok: false, error: '路径必须是已存在的文件夹' }
      }
      const key = normalizeFolderPath(nextPath)
      const dup = this.records.some(
        (r, i) => i !== idx && normalizeFolderPath(r.path) === key
      )
      if (dup) return { ok: false, error: '该路径已存在' }
    }

    const nextNote = patch.note !== undefined ? patch.note.trim() : current.note
    const updated: QuickFolderRecord = {
      ...current,
      path: nextPath,
      note: nextNote,
      updatedAt: Date.now()
    }
    this.records[idx] = updated
    this.scheduleSave()
    this.emit()
    return { ok: true, item: this.toItem(updated) }
  }

  remove(id: string): boolean {
    const idx = this.records.findIndex((r) => r.id === id)
    if (idx < 0) return false
    this.records.splice(idx, 1)
    this.scheduleSave()
    this.emit()
    return true
  }

  /** 按 id 列表重写顺序（须包含全部现有 id） */
  reorder(ids: string[]): boolean {
    if (ids.length !== this.records.length) return false
    const map = new Map(this.records.map((r) => [r.id, r]))
    const next: QuickFolderRecord[] = []
    for (const id of ids) {
      const r = map.get(id)
      if (!r) return false
      next.push(r)
      map.delete(id)
    }
    if (map.size > 0) return false
    this.records = next
    this.scheduleSave()
    this.emit()
    return true
  }

  dispose(): void {
    this.flushSave()
  }

  private toItem(record: QuickFolderRecord): QuickFolderItem {
    return {
      ...record,
      valid: isExistingDirectory(record.path)
    }
  }

  private emit(): void {
    this.onUpdate?.(this.list())
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
