/**
 * 加载 focus-paste 原生模块（与 recorder host 相同的 .node 解析路径）
 */
import { existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { arch, platform } from 'os'

export type FocusPasteNative = {
  captureForegroundHwnd: (ownPid: number) => string | null
  prepareFocusHandoff: (token: string) => void
  isOurProcessHwnd: (token: string, ownPid: number) => boolean
  isForegroundOurs: (ownPid: number) => boolean
  isForegroundTarget: (token: string, ownPid: number) => boolean
  activateFocusTarget: (token: string) => boolean
  simulateCtrlV: () => boolean
  getOwnBundleId: (pid: number) => string | null
  getFrontmostBundleId: () => string | null
  simulateCmdV: () => boolean
}

let cached: FocusPasteNative | null | undefined
let loadError: string | null = null

/** 懒加载；失败返回 null（调用方自行兜底） */
export function loadFocusPaste(): FocusPasteNative | null {
  if (cached !== undefined) return cached
  try {
    const path = resolveNodeFile()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require(path) as FocusPasteNative
    return cached
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err)
    console.error('[focusTarget] focus-paste native 加载失败:', loadError)
    cached = null
    return null
  }
}

export function focusPasteLoadError(): string | null {
  return loadError
}

function resolveNodeFile(): string {
  const name = nodeFileName()
  const candidates = app.isPackaged
    ? [
        join(process.resourcesPath, 'native', name),
        join(process.resourcesPath, 'native', 'focus-paste.node')
      ]
    : [
        join(app.getAppPath(), 'native-rs/focus-paste-napi', name),
        join(__dirname, '../../../../../../native-rs/focus-paste-napi', name),
        join(app.getAppPath(), 'native', name),
        join(__dirname, '../../../../../../native', name)
      ]

  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  throw new Error(
    `focus-paste native binary not found: ${name}（请先执行 npm run build:native）`
  )
}

function nodeFileName(): string {
  if (platform() === 'darwin' && arch() === 'arm64') return 'focus-paste.darwin-arm64.node'
  if (platform() === 'darwin' && arch() === 'x64') return 'focus-paste.darwin-x64.node'
  if (platform() === 'win32' && arch() === 'x64') return 'focus-paste.win32-x64-msvc.node'
  throw new Error(`unsupported platform for focus-paste: ${platform()}-${arch()}`)
}
