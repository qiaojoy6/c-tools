import { existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

/** 系统 hosts 路径（仅 macOS / Windows） */
export function getSystemHostsPath(): string {
  if (process.platform === 'win32') {
    // 避免 32 位进程 WOW64 重定向：优先 SysNative
    const root = process.env.SystemRoot || 'C:\\Windows'
    const sysNative = join(root, 'SysNative', 'drivers', 'etc', 'hosts')
    if (existsSync(sysNative)) return sysNative
    return join(root, 'System32', 'drivers', 'etc', 'hosts')
  }
  return '/etc/hosts'
}

/** 方案持久化路径 */
export function getHostsSchemesPath(): string {
  return join(app.getPath('userData'), 'hosts-schemes.json')
}

export function isHostsPlatformSupported(): boolean {
  return process.platform === 'darwin' || process.platform === 'win32'
}
