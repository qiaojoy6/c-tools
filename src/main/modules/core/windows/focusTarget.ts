import { execFile, execFileSync } from 'child_process'
import { app } from 'electron'

/** 采焦超时（ms） */
const CAPTURE_TIMEOUT_MS = 320

let ownBundleId: string | null | undefined

/** Win32 辅助类型（PowerShell Add-Type，可重复加载） */
const WIN_USER32 = `
Add-Type -ErrorAction SilentlyContinue -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class CToolsFg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
}
"@
`

function runPowerShell(command: string, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { encoding: 'utf8', timeout: timeoutMs, windowsHide: true },
      (err, stdout) => {
        if (err) {
          resolve(null)
          return
        }
        resolve((stdout ?? '').trim() || null)
      }
    )
  })
}

/** 当前进程 macOS bundle id（缓存） */
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

/**
 * 异步读取当前前台目标：
 * - macOS：bundle id
 * - Windows：`hwnd:<句柄>`（排除本进程窗口）
 */
export function getFrontmostBundleId(timeoutMs = CAPTURE_TIMEOUT_MS): Promise<string | null> {
  if (process.platform === 'darwin') {
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
          resolve(stdout.trim() || null)
        }
      )
    })
  }

  if (process.platform === 'win32') {
    const script = `
${WIN_USER32}
$h = [CToolsFg]::GetForegroundWindow()
if ($h -eq [IntPtr]::Zero) { exit 1 }
$procId = 0
[void][CToolsFg]::GetWindowThreadProcessId($h, [ref]$procId)
Write-Output ("hwnd:" + $h.ToInt64().ToString() + "|" + $procId.ToString())
`
    return runPowerShell(script, timeoutMs).then((out) => {
      if (!out) return null
      const [token, pidStr] = out.split('|')
      const pid = Number(pidStr)
      if (!token?.startsWith('hwnd:')) return null
      if (Number.isFinite(pid) && pid === process.pid) return null
      return token
    })
  }

  return Promise.resolve(null)
}

/** 是否为本应用（不可作为粘贴还原目标） */
export function isOwnBundleId(bundleId: string | null | undefined): boolean {
  if (!bundleId) return false
  if (bundleId.startsWith('hwnd:')) return false
  const own = getOwnBundleId()
  if (own && bundleId === own) return true
  if (bundleId === 'com.github.Electron' || bundleId === 'com.electron.app') return true
  if (!app.isPackaged && bundleId.includes('Electron')) return true
  return false
}

/** 过滤后可用的外部焦点目标 */
export function asExternalBundleId(bundleId: string | null | undefined): string | null {
  if (!bundleId || isOwnBundleId(bundleId)) return null
  return bundleId
}

/** 激活外部目标窗口（粘贴前） */
export function activateFocusTarget(target: string): Promise<boolean> {
  if (process.platform === 'darwin') {
    return new Promise((resolve) => {
      execFile(
        'osascript',
        ['-e', `tell application id "${target}" to activate`],
        async (err) => resolve(!err)
      )
    })
  }

  if (process.platform === 'win32' && target.startsWith('hwnd:')) {
    const hwnd = target.slice('hwnd:'.length)
    if (!/^-?\d+$/.test(hwnd)) return Promise.resolve(false)
    // Alt 空按可放宽 SetForegroundWindow 限制；再 AttachThreadInput 抢前台
    const script = `
${WIN_USER32}
$h = [IntPtr]${hwnd}
if ($h -eq [IntPtr]::Zero) { exit 1 }
if ([CToolsFg]::IsIconic($h)) { [void][CToolsFg]::ShowWindow($h, 9) }
# VK_MENU=0x12，短暂按下 Alt 以允许抢前台
[CToolsFg]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
[CToolsFg]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
$fg = [CToolsFg]::GetForegroundWindow()
$pidDummy = 0
$foreTid = [CToolsFg]::GetWindowThreadProcessId($fg, [ref]$pidDummy)
$curTid = [CToolsFg]::GetCurrentThreadId()
$attached = $false
if ($foreTid -ne 0 -and $foreTid -ne $curTid) {
  $attached = [CToolsFg]::AttachThreadInput($curTid, $foreTid, $true)
}
[void][CToolsFg]::ShowWindow($h, 5)
[void][CToolsFg]::BringWindowToTop($h)
$ok = [CToolsFg]::SetForegroundWindow($h)
if ($attached) { [void][CToolsFg]::AttachThreadInput($curTid, $foreTid, $false) }
if (-not $ok) { exit 1 }
exit 0
`
    return runPowerShell(script, 2500).then((out) => out !== null)
  }

  return Promise.resolve(false)
}

/** Windows：在当前前台模拟 Ctrl+V（需先激活目标窗口） */
export function simulateWindowsPasteKey(): Promise<boolean> {
  if (process.platform !== 'win32') return Promise.resolve(false)
  const script = `
${WIN_USER32}
Start-Sleep -Milliseconds 50
# VK_CONTROL=0x11 VK_V=0x56 KEYEVENTF_KEYUP=0x0002
[CToolsFg]::keybd_event(0x11, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 10
[CToolsFg]::keybd_event(0x56, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 10
[CToolsFg]::keybd_event(0x56, 0, 2, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 10
[CToolsFg]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero)
exit 0
`
  return runPowerShell(script, 3000).then((out) => out !== null)
}
