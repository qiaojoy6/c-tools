import { randomUUID } from 'crypto'
import type { HostsMutationResult, HostsScheme, HostsSchemesFile } from '@shared/types'
import { JsonStore } from '../core/storage'
import { getHostsSchemesPath, isHostsPlatformSupported } from './paths'
import { applyEnabledSchemesToSystem, removeAllCtoolsFromSystem } from './systemHosts'

/**
 * Hosts 方案存储：单一 hosts-schemes.json；动系统时走提权写入。
 */
export class HostsStore {
  private schemes: HostsScheme[] = []
  private store: JsonStore<HostsSchemesFile>
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private onUpdate: ((schemes: HostsScheme[]) => void) | null = null
  /** 防止并发提权写互相覆盖 */
  private writeChain: Promise<void> = Promise.resolve()

  constructor() {
    this.store = new JsonStore<HostsSchemesFile>(getHostsSchemesPath())
  }

  setOnUpdate(handler: (schemes: HostsScheme[]) => void): void {
    this.onUpdate = handler
  }

  init(): void {
    const data = this.store.read()
    this.schemes = data?.schemes ?? []
  }

  list(): HostsScheme[] {
    return this.schemes.map((s) => ({ ...s }))
  }

  /** 添加方案：立刻落本地，开关默认关 */
  add(name: string): HostsMutationResult {
    const trimmed = name.trim()
    if (!trimmed) return { ok: false, error: '名称不能为空' }
    const now = Date.now()
    const scheme: HostsScheme = {
      id: randomUUID(),
      name: trimmed,
      enabled: false,
      content: '',
      createdAt: now,
      updatedAt: now
    }
    this.schemes.push(scheme)
    this.persist()
    this.emit()
    return { ok: true, schemes: this.list() }
  }

  rename(id: string, name: string): HostsMutationResult {
    const s = this.find(id)
    if (!s) return { ok: false, error: '方案不存在' }
    const trimmed = name.trim()
    if (!trimmed) return { ok: false, error: '名称不能为空' }
    s.name = trimmed
    s.updatedAt = Date.now()
    this.persist()
    this.emit()
    return { ok: true, schemes: this.list() }
  }

  /**
   * 更新内容：始终写本地；若已开启则提权更新系统对应段（整表重建启用段）。
   */
  async setContent(id: string, content: string): Promise<HostsMutationResult> {
    const s = this.find(id)
    if (!s) return { ok: false, error: '方案不存在' }
    s.content = typeof content === 'string' ? content : ''
    s.updatedAt = Date.now()
    this.persist()
    this.emit()
    if (s.enabled) {
      const err = await this.syncSystem()
      if (err) return { ok: false, error: err }
    }
    return { ok: true, schemes: this.list() }
  }

  /** 开：写入系统段；关：删除系统段 */
  async setEnabled(id: string, enabled: boolean): Promise<HostsMutationResult> {
    const s = this.find(id)
    if (!s) return { ok: false, error: '方案不存在' }
    if (s.enabled === enabled) return { ok: true, schemes: this.list() }

    const platformErr = this.platformGuard()
    if (platformErr) return { ok: false, error: platformErr }

    s.enabled = enabled
    s.updatedAt = Date.now()
    this.persist()
    this.emit()

    const err = await this.syncSystem()
    if (err) {
      // 回滚开关，避免本地与系统长期不一致
      s.enabled = !enabled
      s.updatedAt = Date.now()
      this.persist()
      this.emit()
      return { ok: false, error: err }
    }
    return { ok: true, schemes: this.list() }
  }

  /** 开启中禁止删除 */
  remove(id: string): HostsMutationResult {
    const idx = this.schemes.findIndex((s) => s.id === id)
    if (idx < 0) return { ok: false, error: '方案不存在' }
    if (this.schemes[idx]!.enabled) {
      return { ok: false, error: '请先关闭开关再删除' }
    }
    this.schemes.splice(idx, 1)
    this.persist()
    this.emit()
    return { ok: true, schemes: this.list() }
  }

  /** 拖拽排序；若有任一开启则立刻提权重写系统 */
  async reorder(ids: string[]): Promise<HostsMutationResult> {
    if (ids.length !== this.schemes.length) return { ok: false, error: '顺序无效' }
    const map = new Map(this.schemes.map((s) => [s.id, s]))
    const next: HostsScheme[] = []
    for (const id of ids) {
      const s = map.get(id)
      if (!s) return { ok: false, error: '顺序无效' }
      next.push(s)
      map.delete(id)
    }
    if (map.size > 0) return { ok: false, error: '顺序无效' }

    const prev = this.schemes
    this.schemes = next
    this.persist()
    this.emit()

    if (this.schemes.some((s) => s.enabled)) {
      const err = await this.syncSystem()
      if (err) {
        this.schemes = prev
        this.persist()
        this.emit()
        return { ok: false, error: err }
      }
    }
    return { ok: true, schemes: this.list() }
  }

  /** 从系统移除全部 c-tools 段；本地方案 enabled 全部置 false */
  async removeAllFromSystem(): Promise<HostsMutationResult> {
    const platformErr = this.platformGuard()
    if (platformErr) return { ok: false, error: platformErr }
    const err = await this.enqueueWrite(() => removeAllCtoolsFromSystem())
    if (err) return { ok: false, error: err }
    for (const s of this.schemes) {
      if (s.enabled) {
        s.enabled = false
        s.updatedAt = Date.now()
      }
    }
    this.persist()
    this.emit()
    return { ok: true, schemes: this.list() }
  }

  dispose(): void {
    this.flushSave()
  }

  private find(id: string): HostsScheme | undefined {
    return this.schemes.find((s) => s.id === id)
  }

  private platformGuard(): string | null {
    if (!isHostsPlatformSupported()) return '仅支持 macOS 与 Windows'
    return null
  }

  private async syncSystem(): Promise<string | null> {
    const platformErr = this.platformGuard()
    if (platformErr) return platformErr
    return this.enqueueWrite(() => applyEnabledSchemesToSystem(this.schemes))
  }

  private enqueueWrite(fn: () => Promise<void>): Promise<string | null> {
    const run = this.writeChain.then(fn).then(
      () => null as string | null,
      (err: unknown) => (err instanceof Error ? err.message : String(err))
    )
    // 串行队列：失败也继续后续任务
    this.writeChain = run.then(() => undefined, () => undefined)
    return run
  }

  private emit(): void {
    this.onUpdate?.(this.list())
  }

  private persist(): void {
    this.scheduleSave()
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.flushSave(), 200)
  }

  private flushSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    this.store.write({ version: 1, schemes: this.schemes })
  }
}
