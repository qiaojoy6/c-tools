/**
 * 前台目标采集 / 激活 / 模拟粘贴 — 跨平台入口
 * - mac：`./mac`（focus-paste-napi）
 * - win：`./win`（focus-paste-napi；失败回退 PowerShell）
 * 平台差异改各自文件，此处只做分发与共享判定。
 */
import { app } from 'electron'
import { spawn } from 'child_process'
import * as mac from './mac'
import * as win from './win'

export function getOwnBundleId(): string | null {
  if (process.platform !== 'darwin') return null
  return mac.getOwnBundleId()
}

/**
 * 异步读取当前前台目标：
 * - macOS：bundle id
 * - Windows：`hwnd:<句柄>`（排除本应用窗口）
 */
export function getFrontmostBundleId(timeoutMs?: number): Promise<string | null> {
  if (process.platform === 'darwin') return mac.getFrontmostBundleId(timeoutMs)
  if (process.platform === 'win32') return win.getFrontmostBundleId()
  return Promise.resolve(null)
}

export function isOwnBundleId(bundleId: string | null | undefined): boolean {
  if (!bundleId) return false
  if (bundleId.startsWith('hwnd:')) {
    if (process.platform !== 'win32') return false
    return win.isOurProcessHwnd(bundleId)
  }
  const own = getOwnBundleId()
  if (own && bundleId === own) return true
  if (
    bundleId === 'com.ctools.app' ||
    bundleId === 'com.github.Electron' ||
    bundleId === 'com.electron.app'
  )
    return true
  if (!app.isPackaged && bundleId.includes('Electron')) return true
  return false
}

export function asExternalBundleId(bundleId: string | null | undefined): string | null {
  if (!bundleId || isOwnBundleId(bundleId)) return null
  return bundleId
}

/** 激活外部目标窗口（粘贴前） */
export async function activateFocusTarget(target: string): Promise<boolean> {
  if (process.platform === 'darwin') return mac.activateFocusTarget(target)
  if (process.platform === 'win32') return Promise.resolve(win.activateFocusTarget(target))
  return false
}

/** 模拟 Cmd/Ctrl+V（平台实现内含激活后短等待） */
export function simulatePasteKey(): Promise<boolean> {
  if (process.platform === 'darwin') return mac.simulatePasteKey()
  if (process.platform === 'win32') return win.simulatePasteKey()
  // Linux 兜底
  return new Promise((resolve) => {
    try {
      const child = spawn('xdotool', ['key', '--clearmodifiers', 'ctrl+v'])
      child.on('error', () => resolve(false))
      child.on('exit', (code) => resolve(code === 0))
    } catch {
      resolve(false)
    }
  })
}

/** Windows：同步采前台 hwnd */
export function captureWindowsForegroundHwnd(): string | null {
  if (process.platform !== 'win32') return null
  return win.captureWindowsForegroundHwnd()
}

/** Windows：hide 浮层前放行目标抢焦点 */
export function prepareWindowsFocusHandoff(token: string): void {
  if (process.platform !== 'win32') return
  win.prepareWindowsFocusHandoff(token)
}

/** Windows：当前前台是否属于本进程 */
export function isWindowsForegroundOurs(): boolean {
  if (process.platform !== 'win32') return false
  return win.isWindowsForegroundOurs()
}

/** Windows：当前前台是否已是目标 */
export function isWindowsForegroundTarget(token: string): boolean {
  if (process.platform !== 'win32') return false
  return win.isWindowsForegroundTarget(token)
}
