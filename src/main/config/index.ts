import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { AppConfig, ConfigPatch } from '@shared/types'
import { DEFAULT_CONFIG } from './defaults'

/** 应用开机自启设置 */
export function applyLoginItem(enabled: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true
  })
}

const SETTINGS_FILE = 'settings.json'

/** 深合并普通对象（override 优先） */
function deepMerge<T>(base: T, override: unknown): T {
  if (override === null || override === undefined) return base
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return override as T
  if (typeof override !== 'object' || Array.isArray(override)) return override as T
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [key, value] of Object.entries(override)) {
    if (key in result) {
      result[key] = deepMerge(result[key], value)
    }
  }
  return result as T
}

/**
 * 配置中心：窗口、快捷键、监听、隐私等全部配置化
 */
export class ConfigManager {
  private filePath: string
  private config: AppConfig

  constructor() {
    this.filePath = join(app.getPath('userData'), SETTINGS_FILE)
    this.config = this.load()
  }

  get(): AppConfig {
    return this.config
  }

  /** 局部更新配置并持久化 */
  update(patch: ConfigPatch): AppConfig {
    this.config = deepMerge(this.config, patch)
    this.save()
    return this.config
  }

  private load(): AppConfig {
    try {
      if (existsSync(this.filePath)) {
        const raw = JSON.parse(readFileSync(this.filePath, 'utf-8'))
        return deepMerge(structuredClone(DEFAULT_CONFIG), raw)
      }
    } catch (err) {
      console.error('[config] 读取失败，使用默认配置:', err)
    }
    return structuredClone(DEFAULT_CONFIG)
  }

  private save(): void {
    try {
      mkdirSync(app.getPath('userData'), { recursive: true })
      const tmp = `${this.filePath}.tmp`
      writeFileSync(tmp, JSON.stringify(this.config, null, 2), 'utf-8')
      renameSync(tmp, this.filePath)
    } catch (err) {
      console.error('[config] 保存失败:', err)
    }
  }
}

export { DEFAULT_CONFIG }
export type { AppConfig, ConfigPatch }
