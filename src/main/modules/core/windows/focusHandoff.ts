/**
 * 还焦编排（粘贴关浮层 / 截屏收尾共用）
 *
 * 标准顺序（与独立剪贴板一致）：
 * 1. prepareYieldFocus — Win 放行目标抢前台（须在 hide 之前）
 * 2. hide 本应用窗
 * 3. activateExternalApp — 激活外部并等待焦点稳定
 */
import { delay } from './loadRoute'
import {
  activateFocusTarget,
  captureWindowsForegroundHwnd,
  getFrontmostBundleId,
  isWindowsForegroundOurs,
  isWindowsForegroundTarget,
  prepareWindowsFocusHandoff
} from './focusTarget'

/** 还焦后等待时长（经验值，非系统标准；过短易贴错窗） */
export const RESTORE_FOCUS_DELAY_MS = process.platform === 'win32' ? 180 : 90

/** Win：在 hide 本应用窗之前调用，放行目标抢前台 */
export function prepareYieldFocus(bundleId: string | null | undefined): void {
  if (!bundleId || process.platform !== 'win32') return
  prepareWindowsFocusHandoff(bundleId)
}

/** hide 之后：激活外部应用并等待焦点稳定 */
export async function activateExternalApp(bundleId: string | null): Promise<boolean> {
  if (process.platform === 'darwin') {
    if (!bundleId) return false
    const ok = await activateFocusTarget(bundleId)
    if (!ok) return false
    await delay(RESTORE_FOCUS_DELAY_MS)
    return true
  }

  if (process.platform === 'win32') {
    if (bundleId) {
      await delay(50)
      await activateFocusTarget(bundleId)
      await delay(RESTORE_FOCUS_DELAY_MS)
      if (isWindowsForegroundOurs() || !isWindowsForegroundTarget(bundleId)) {
        await activateFocusTarget(bundleId)
        await delay(80)
      }
    } else {
      await delay(RESTORE_FOCUS_DELAY_MS + 50)
    }
    return !isWindowsForegroundOurs()
  }

  await delay(RESTORE_FOCUS_DELAY_MS)
  return true
}

/** 当前前台原始 id（含本应用）；采集失败为 null */
export async function captureFrontmostRaw(): Promise<string | null> {
  if (process.platform === 'win32') {
    return captureWindowsForegroundHwnd()
  }
  return getFrontmostBundleId()
}
