/**
 * macOS：前台目标采集 / 激活 / 模拟 ⌘V（osascript）
 */
import { execFile, execFileSync, spawn } from 'child_process'

const CAPTURE_TIMEOUT_MS = 320
/** 激活目标应用后、发粘贴键前的短等待 */
const PRE_PASTE_DELAY_MS = 10

let ownBundleId: string | null | undefined

/** 本进程 bundle id（缓存） */
export function getOwnBundleId(): string | null {
  if (ownBundleId !== undefined) return ownBundleId
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
  return new Promise((resolve) => {
    execFile(
      'osascript',
      [
        '-e',
        'tell application "System Events" to get bundle identifier of first application process whose frontmost is true'
      ],
      { encoding: 'utf8', timeout: Math.max(timeoutMs, 800) },
      (err, stdout) => {
        if (err) {
          resolve(null)
          return
        }
        resolve(stdout.trim() || null)
      }
    )
  })
}

/** 激活外部目标应用（粘贴前） */
export function activateFocusTarget(target: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('osascript', ['-e', `tell application id "${target}" to activate`], (err) =>
      resolve(!err)
    )
  })
}

/** 模拟 ⌘V */
export async function simulatePasteKey(): Promise<boolean> {
  await delay(PRE_PASTE_DELAY_MS)
  return new Promise((resolve) => {
    try {
      const child = spawn('osascript', [
        '-e',
        'tell application "System Events" to keystroke "v" using command down'
      ])
      let stderr = ''
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk)
      })
      child.on('error', () => resolve(false))
      child.on('exit', (code) => {
        if (isAccessibilityDenied(stderr)) {
          resolve(false)
          return
        }
        resolve(code === 0)
      })
    } catch {
      resolve(false)
    }
  })
}

function isAccessibilityDenied(stderr: string): boolean {
  const s = stderr.toLowerCase()
  return (
    s.includes('not allowed') ||
    s.includes('1002') ||
    s.includes('1743') ||
    s.includes('辅助功能') ||
    s.includes('accessibility')
  )
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
