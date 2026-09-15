/**
 * Windows：前台 hwnd 采集 / 激活 / 模拟 Ctrl+V
 * 原生逻辑在 focus-paste-napi；此处只做延时编排与 PowerShell 兜底
 */
import { execFile } from 'child_process'
import { loadFocusPaste } from './native'

/** 激活目标应用后、发粘贴键前的短等待 */
const PRE_PASTE_DELAY_MS = 80

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** 同步采前台 hwnd（快捷键回调里尽早采，避免 show 后丢目标） */
export function captureWindowsForegroundHwnd(): string | null {
  const native = loadFocusPaste()
  if (!native) return null
  try {
    return native.captureForegroundHwnd(process.pid)
  } catch (err) {
    console.error('[focusTarget/win] GetForegroundWindow 失败:', err)
    return null
  }
}

/** 与跨平台 API 对齐：返回 `hwnd:<句柄>` */
export function getFrontmostBundleId(): Promise<string | null> {
  return Promise.resolve(captureWindowsForegroundHwnd())
}

/**
 * 在本进程仍占前台时放行目标进程抢焦点。
 * 必须在 hide 浮层之前调用，否则 AllowSetForegroundWindow 无效。
 */
export function prepareWindowsFocusHandoff(token: string): void {
  if (!token.startsWith('hwnd:')) return
  const native = loadFocusPaste()
  if (!native) return
  try {
    native.prepareFocusHandoff(token)
  } catch (err) {
    console.error('[focusTarget/win] prepareWindowsFocusHandoff 失败:', err)
  }
}

/** 句柄是否属于本进程（含子窗） */
export function isOurProcessHwnd(token: string): boolean {
  if (!token.startsWith('hwnd:')) return false
  const native = loadFocusPaste()
  if (!native) return false
  try {
    return native.isOurProcessHwnd(token, process.pid)
  } catch {
    return false
  }
}

/** 当前前台是否属于本进程（含子窗） */
export function isWindowsForegroundOurs(): boolean {
  const native = loadFocusPaste()
  if (!native) return false
  try {
    return native.isForegroundOurs(process.pid)
  } catch {
    return false
  }
}

/** 当前前台是否已是目标 hwnd（或其同进程顶层窗） */
export function isWindowsForegroundTarget(token: string): boolean {
  if (!token.startsWith('hwnd:')) return false
  const native = loadFocusPaste()
  if (!native) return false
  try {
    return native.isForegroundTarget(token, process.pid)
  } catch {
    return false
  }
}

/** 激活外部目标窗口（粘贴前） */
export function activateFocusTarget(token: string): boolean {
  if (!token.startsWith('hwnd:')) return false
  const native = loadFocusPaste()
  if (!native) return false
  try {
    return native.activateFocusTarget(token)
  } catch (err) {
    console.error('[focusTarget/win] SetForegroundWindow 失败:', err)
    return false
  }
}

/**
 * 一律走 Ctrl+V（SendInput / keybd_event）。
 * 延时留在 TS；原生不可用时回退 PowerShell SendKeys。
 */
export async function simulatePasteKey(): Promise<boolean> {
  try {
    await sleep(PRE_PASTE_DELAY_MS)
    if (isWindowsForegroundOurs()) {
      await sleep(120)
    }
    if (isWindowsForegroundOurs()) {
      console.warn('[focusTarget/win] 粘贴时前台仍是本进程，跳过模拟键')
      return false
    }

    const native = loadFocusPaste()
    if (native?.simulateCtrlV()) return true
    return await simulatePasteKeyPowershell()
  } catch (err) {
    console.error('[focusTarget/win] 模拟 Ctrl+V 失败:', err)
    return simulatePasteKeyPowershell()
  }
}

/** 原生不可用时的兜底：WScript.Shell SendKeys */
function simulatePasteKeyPowershell(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-STA',
        '-Command',
        `$w=New-Object -ComObject WScript.Shell; Start-Sleep -Milliseconds 80; $w.SendKeys('^v')`
      ],
      { timeout: 5000, windowsHide: true },
      (err) => resolve(!err)
    )
  })
}
