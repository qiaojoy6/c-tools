import { execFile, execFileSync } from 'child_process'
import { app } from 'electron'

/** 读取前台 app bundle id 的超时（ms）；过短易空，过长拖慢唤起 */
const CAPTURE_TIMEOUT_MS = 280

let ownBundleId: string | null | undefined

/** 当前进程对应的 bundle id（缓存） */
export function getOwnBundleId(): string | null {
  if (ownBundleId !== undefined) return ownBundleId
  if (process.platform !== 'darwin') {
    ownBundleId = null
    return null
  }
  try {
    const out = execFileSync(
      'osascript',
      [
        '-e',
        `tell application "System Events" to get bundle identifier of first process whose unix id is ${process.pid}`
      ],
      { encoding: 'utf8', timeout: 500 }
    ).trim()
    ownBundleId = out || null
  } catch {
    ownBundleId = null
  }
  return ownBundleId
}

/** 异步读取当前前台应用 bundle id */
export function getFrontmostBundleId(timeoutMs = CAPTURE_TIMEOUT_MS): Promise<string | null> {
  if (process.platform !== 'darwin') return Promise.resolve(null)

  return new Promise((resolve) => {
    execFile(
      'osascript',
      [
        '-e',
        'tell application "System Events" to get bundle identifier of first application process whose frontmost is true'
      ],
      { encoding: 'utf8', timeout: timeoutMs },
      (err, stdout) => {
        if (err) {
          resolve(null)
          return
        }
        const id = stdout.trim()
        resolve(id || null)
      }
    )
  })
}

/** 是否为本应用（不可作为粘贴还原目标） */
export function isOwnBundleId(bundleId: string | null | undefined): boolean {
  if (!bundleId) return false
  const own = getOwnBundleId()
  if (own && bundleId === own) return true
  // 开发态 Electron
  if (bundleId === 'com.github.Electron' || bundleId === 'com.electron.app') {
    if (!app.isPackaged) return true
  }
  if (bundleId === 'com.electron.app') return true
  return false
}

/** 过滤后可用的外部应用 id */
export function asExternalBundleId(bundleId: string | null | undefined): string | null {
  if (!bundleId || isOwnBundleId(bundleId)) return null
  return bundleId
}
