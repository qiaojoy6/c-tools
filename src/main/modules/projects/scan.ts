import { basename, join } from 'path'
import { existsSync, readdirSync, statSync } from 'fs'
import type { ProjectOverride, ProjectsConfig, ScannedProject } from '@shared/types'
import { normalizeBasePath } from './basePath'
import { resolveProjectIconDataUrl } from './icon'

/** 工作区根目录本身作为项目时的稳定 id */
export const ROOT_PROJECT_ID = '.'

/** 默认入口探测顺序 */
const DEFAULT_ENTRIES = ['index.html', 'dist/index.html'] as const

/** 解析项目入口：优先用户覆盖，否则按默认顺序探测 */
export function resolveEntryPath(projectDir: string, override?: ProjectOverride): string | null {
  const custom = override?.entryPath?.trim()
  if (custom) {
    const abs = join(projectDir, custom)
    return existsSync(abs) ? custom.replace(/\\/g, '/') : null
  }
  for (const entry of DEFAULT_ENTRIES) {
    if (existsSync(join(projectDir, entry))) return entry
  }
  return null
}

function toScanned(
  folderName: string,
  absPath: string,
  entryPath: string,
  override?: ProjectOverride,
  fallbackName?: string
): ScannedProject {
  const fixed = override?.port
  return {
    folderName,
    absPath,
    displayName: override?.displayName?.trim() || fallbackName || folderName,
    entryPath,
    basePath: normalizeBasePath(override?.basePath),
    port: typeof fixed === 'number' && fixed > 0 ? fixed : null,
    iconUrl: resolveProjectIconDataUrl(absPath, entryPath)
  }
}

/**
 * 扫描工作区：
 * 1) 一级子目录含 index.html / dist/index.html → 项目
 * 2) 根目录本身含入口 → 也算一个项目（folderName 为 `.`）
 *    方便直接选中某个已打包目录当「工作区」
 */
export function scanWorkspace(config: ProjectsConfig): ScannedProject[] {
  const root = config.workspaceRoot?.trim()
  if (!root || !existsSync(root)) return []

  let names: string[]
  try {
    names = readdirSync(root)
  } catch {
    return []
  }

  const results: ScannedProject[] = []

  for (const name of names) {
    // 跳过隐藏目录
    if (name.startsWith('.')) continue

    const absPath = join(root, name)
    let isDir = false
    try {
      isDir = statSync(absPath).isDirectory()
    } catch {
      continue
    }
    if (!isDir) continue

    const override = config.overrides[name]
    const entryPath = resolveEntryPath(absPath, override)
    if (!entryPath) continue

    results.push(toScanned(name, absPath, entryPath, override))
  }

  // 根目录自身是静态包（无子项目或与子项目并存均可）
  const rootOverride = config.overrides[ROOT_PROJECT_ID]
  const rootEntry = resolveEntryPath(root, rootOverride)
  if (rootEntry) {
    results.unshift(
      toScanned(ROOT_PROJECT_ID, root, rootEntry, rootOverride, basename(root))
    )
  }

  results.sort((a, b) => {
    // 根项目固定靠前
    if (a.folderName === ROOT_PROJECT_ID) return -1
    if (b.folderName === ROOT_PROJECT_ID) return 1
    return a.displayName.localeCompare(b.displayName, 'zh')
  })
  return results
}
