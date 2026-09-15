/**
 * macOS：前台目标采集 / 激活 / 模拟 ⌘V
 * 原生逻辑在 focus-paste-napi；此处只做短延时与加载兜底
 */
import { loadFocusPaste } from './native'

const PRE_PASTE_DELAY_MS = 10

let ownBundleId: string | null | undefined

/** 本进程 bundle id（缓存） */
export function getOwnBundleId(): string | null {
  if (ownBundleId !== undefined) return ownBundleId
  const native = loadFocusPaste()
  if (!native) {
    ownBundleId = null
    return null
  }
  try {
    ownBundleId = native.getOwnBundleId(process.pid)
  } catch {
    ownBundleId = null
  }
  return ownBundleId
}

/** 异步读取当前前台应用 bundle id */
export function getFrontmostBundleId(_timeoutMs?: number): Promise<string | null> {
  return new Promise((resolve) => {
    const native = loadFocusPaste()
    if (!native) {
      resolve(null)
      return
    }
    try {
      resolve(native.getFrontmostBundleId())
    } catch {
      resolve(null)
    }
  })
}

/** 激活外部目标应用（粘贴前） */
export function activateFocusTarget(target: string): Promise<boolean> {
  return new Promise((resolve) => {
    const native = loadFocusPaste()
    if (!native) {
      resolve(false)
      return
    }
    try {
      resolve(native.activateFocusTarget(target))
    } catch {
      resolve(false)
    }
  })
}

/** 模拟 ⌘V */
export async function simulatePasteKey(): Promise<boolean> {
  await delay(PRE_PASTE_DELAY_MS)
  const native = loadFocusPaste()
  if (!native) return false
  try {
    return native.simulateCmdV()
  } catch {
    return false
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
