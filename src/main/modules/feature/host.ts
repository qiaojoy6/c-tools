import type {
  FeatureContext,
  FeatureHandles,
  FeatureShortcutGates,
  MainFeatureDescriptor
} from './defineFeature'
import type { ShortcutHandlers, TrayContribution } from '../core'

const TOGGLE_LABELS: Record<string, string> = {
  clipboard: '剪贴板',
  quickFolders: '快捷文件夹',
  projects: '项目',
  screenshot: '截屏',
  recorder: '录屏'
}

/**
 * 主进程 Feature 宿主：编译期注册 → setup → registerIpc → dispose
 * 支持启动跳过 + 运行时热加载（首次启用时 setup/IPC）+ 软停用。
 */
export class FeatureHost {
  private readonly features: MainFeatureDescriptor[] = []
  private readonly handlesById = new Map<string, FeatureHandles>()
  /** 已调用过 registerIpc 的 id（避免 ipcMain.handle 重复注册） */
  private readonly ipcRegistered = new Set<string>()
  private setupCtx: FeatureContext | null = null
  private setupDone = false

  /** 注册内置 Feature（须在 setupAll 之前） */
  register(feature: MainFeatureDescriptor): void {
    if (this.setupDone) {
      throw new Error(`FeatureHost: cannot register "${feature.id}" after setupAll`)
    }
    if (this.features.some((f) => f.id === feature.id)) {
      throw new Error(`FeatureHost: duplicate feature id "${feature.id}"`)
    }
    this.features.push(feature)
  }

  /** 某 Feature 是否在配置中启用（缺省 true） */
  isEnabled(id: string, ctx: FeatureContext = this.requireCtx()): boolean {
    const map = ctx.config.get().features?.enabled
    if (!map) return true
    return map[id as keyof typeof map] !== false
  }

  /** 已 setup 的 Feature id 列表 */
  loadedIds(): string[] {
    return [...this.handlesById.keys()]
  }

  /** @deprecated 使用 loadedIds */
  enabledIds(): string[] {
    return this.loadedIds()
  }

  /** 按注册顺序执行 setup；disabled 的跳过 */
  setupAll(ctx: FeatureContext): void {
    if (this.setupDone) return
    this.setupCtx = ctx
    for (const feature of this.features) {
      if (!this.isEnabled(feature.id, ctx)) {
        console.info(`[feature] skip disabled: ${feature.id}`)
        continue
      }
      this.loadFeature(feature, { quietSkip: true })
    }
    this.setupDone = true
  }

  /** 按注册顺序注册各 Feature 的 IPC（仅已 setup 且尚未注册的） */
  registerAllIpc(): void {
    if (!this.setupDone || !this.setupCtx) {
      throw new Error('FeatureHost: call setupAll before registerAllIpc')
    }
    for (const feature of this.features) {
      this.registerFeatureIpc(feature)
    }
  }

  /**
   * 聚合各 Feature 贡献的快捷键 handler。
   * 按当前 config.features.enabled 过滤（运行时开关立即生效）。
   */
  collectShortcutHandlers(gates?: FeatureShortcutGates): Partial<ShortcutHandlers> {
    if (!this.setupDone || !this.setupCtx) {
      throw new Error('FeatureHost: call setupAll before collectShortcutHandlers')
    }
    const resolved: FeatureShortcutGates = gates ?? {
      isScreenshotActive: () => this.setupCtx!.shared.isScreenshotActive?.() ?? false,
      isRecorderSelectActive: () => this.setupCtx!.shared.isRecorderSelectActive?.() ?? false
    }
    const merged: Partial<ShortcutHandlers> = {}
    for (const feature of this.features) {
      const handles = this.handlesById.get(feature.id)
      if (!handles || !feature.bindShortcuts) continue
      if (!this.isRuntimeActive(feature.id)) continue
      Object.assign(merged, feature.bindShortcuts(this.setupCtx, handles, resolved))
    }
    return merged
  }

  /** 聚合托盘菜单贡献（按 order 排序；尊重运行时 enabled） */
  collectTrayContributions(): TrayContribution[] {
    if (!this.setupDone || !this.setupCtx) {
      throw new Error('FeatureHost: call setupAll before collectTrayContributions')
    }
    const list: TrayContribution[] = []
    for (const feature of this.features) {
      const handles = this.handlesById.get(feature.id)
      if (!handles || !feature.bindTray) continue
      if (!this.isRuntimeActive(feature.id)) continue
      const contrib = feature.bindTray(this.setupCtx, handles)
      if (Array.isArray(contrib)) list.push(...contrib)
      else list.push(contrib)
    }
    return list.sort((a, b) => a.order - b.order)
  }

  /**
   * 运行时是否应对外暴露（已 setup 且配置启用）。
   * 截屏额外要求剪贴板当前也启用。
   */
  isRuntimeActive(id: string): boolean {
    if (!this.setupCtx) return false
    if (!this.handlesById.has(id)) return false
    if (!this.isEnabled(id, this.setupCtx)) return false
    if (id === 'screenshot' && !this.isEnabled('clipboard', this.setupCtx)) return false
    return true
  }

  /**
   * 功能开关变更后同步：热加载尚未 setup 的模块 + 软停用（剪贴板监听等）。
   */
  syncRuntimeFeatures(): { loaded: string[]; warnings: string[] } {
    if (!this.setupCtx) return { loaded: [], warnings: [] }

    const loaded: string[] = []
    const warnings: string[] = []

    // 按注册顺序热加载，保证 clipboard → screenshot 依赖
    for (const feature of this.features) {
      if (!this.isEnabled(feature.id, this.setupCtx)) continue
      if (this.handlesById.has(feature.id)) continue

      const ok = this.loadFeature(feature, { quietSkip: false })
      if (ok) {
        this.registerFeatureIpc(feature)
        loaded.push(feature.id)
        console.info(`[feature] hot-loaded: ${feature.id}`)
      } else if (feature.id === 'screenshot' && !this.handlesById.has('clipboard')) {
        warnings.push('截屏依赖剪贴板，请先开启剪贴板')
      } else {
        warnings.push(`${TOGGLE_LABELS[feature.id] ?? feature.id} 加载失败`)
      }
    }

    // 软停用 / 恢复剪贴板监听
    const clip = this.handlesById.get('clipboard') as
      | { watcher?: { start: () => void; stop: () => void } }
      | undefined
    if (clip?.watcher) {
      if (this.isEnabled('clipboard', this.setupCtx)) clip.watcher.start()
      else clip.watcher.stop()
    }

    return { loaded, warnings }
  }

  /** @deprecated 使用 syncRuntimeFeatures */
  applyRuntimeToggles(): { needsRestart: string[] } {
    const { warnings } = this.syncRuntimeFeatures()
    return {
      needsRestart: warnings.length ? ['(see warnings)'] : []
    }
  }

  /** 取某 Feature 的 setup 句柄（未启用则抛错） */
  getHandles<T extends FeatureHandles>(id: string): T {
    const handles = this.handlesById.get(id)
    if (!handles) {
      throw new Error(`FeatureHost: no handles for "${id}" (disabled or not setup)`)
    }
    return handles as T
  }

  /** 取句柄；未启用返回 undefined */
  tryGetHandles<T extends FeatureHandles>(id: string): T | undefined {
    return this.handlesById.get(id) as T | undefined
  }

  /** 退出时逆序 dispose */
  async disposeAll(): Promise<void> {
    const ids = [...this.handlesById.keys()].reverse()
    for (const id of ids) {
      const handles = this.handlesById.get(id)
      if (!handles?.dispose) continue
      await handles.dispose()
    }
    this.handlesById.clear()
    this.ipcRegistered.clear()
  }

  private requireCtx(): FeatureContext {
    if (!this.setupCtx) throw new Error('FeatureHost: not setup')
    return this.setupCtx
  }

  /** setup 单个 Feature；失败返回 false */
  private loadFeature(
    feature: MainFeatureDescriptor,
    opts: { quietSkip: boolean }
  ): boolean {
    const ctx = this.requireCtx()
    if (this.handlesById.has(feature.id)) return true

    if (feature.id === 'screenshot' && !this.handlesById.has('clipboard')) {
      if (!opts.quietSkip) {
        console.warn('[feature] cannot load screenshot: clipboard not loaded')
      }
      return false
    }

    try {
      const handles = feature.setup(ctx)
      this.handlesById.set(feature.id, handles)
      return true
    } catch (err) {
      console.error(`[feature] setup failed: ${feature.id}`, err)
      return false
    }
  }

  private registerFeatureIpc(feature: MainFeatureDescriptor): void {
    const ctx = this.requireCtx()
    const handles = this.handlesById.get(feature.id)
    if (!handles || !feature.registerIpc) return
    if (this.ipcRegistered.has(feature.id)) return
    feature.registerIpc(ctx, handles)
    this.ipcRegistered.add(feature.id)
  }
}
