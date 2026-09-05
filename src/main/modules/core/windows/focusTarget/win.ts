/**
 * Windows：前台 hwnd 采集 / 激活 / 模拟 Ctrl+V
 * 主进程 koffi 调 user32（避免 PowerShell 超时导致双击粘贴失败）
 */
import { execFile } from 'child_process'
import { BrowserWindow } from 'electron'

/** 激活目标应用后、发粘贴键前的短等待 */
const PRE_PASTE_DELAY_MS = 80

/** koffi 返回的 HWND 为 opaque pointer；用 address 转成可比较的数字 */
type Hwnd = unknown

type WinApi = {
  koffi: typeof import('koffi')
  GetForegroundWindow: () => Hwnd
  SetForegroundWindow: (h: Hwnd) => number
  SetActiveWindow: (h: Hwnd) => Hwnd
  ShowWindow: (h: Hwnd, n: number) => number
  IsIconic: (h: Hwnd) => number
  IsWindow: (h: Hwnd) => number
  BringWindowToTop: (h: Hwnd) => number
  SetWindowPos: (
    h: Hwnd,
    insertAfter: Hwnd | number,
    x: number,
    y: number,
    cx: number,
    cy: number,
    flags: number
  ) => number
  AllowSetForegroundWindow: (pid: number) => number
  LockSetForegroundWindow: (lock: number) => number
  SwitchToThisWindow: (h: Hwnd, altTab: number) => void
  SystemParametersInfoW: (
    action: number,
    uiParam: number,
    pvParam: Buffer | number,
    fWinIni: number
  ) => number
  GetWindowThreadProcessId: (h: Hwnd, pid: Buffer) => number
  AttachThreadInput: (a: number, b: number, f: number) => number
  GetCurrentThreadId: () => number
  GetGUIThreadInfo: (id: number, info: Buffer) => number
  SendMessageW: (h: Hwnd, msg: number, w: number, l: number) => number
  keybd_event: (vk: number, scan: number, flags: number, extra: number) => void
  SendInput: (n: number, inputs: Buffer, cbSize: number) => number
  ptrSize: number
  guiThreadInfoSize: number
}

let winApi: WinApi | null | undefined

function loadWinApi(): WinApi | null {
  if (winApi !== undefined) return winApi
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi = require('koffi') as typeof import('koffi')
    const user32 = koffi.load('user32.dll')
    const kernel32 = koffi.load('kernel32.dll')
    const ptrSize = koffi.sizeof('void *')
    // GUITHREADINFO：cbSize + flags + 6*HWND + RECT(16)
    const guiThreadInfoSize = 8 + ptrSize * 6 + 16

    winApi = {
      koffi,
      GetForegroundWindow: user32.func('void * __stdcall GetForegroundWindow()'),
      SetForegroundWindow: user32.func('bool __stdcall SetForegroundWindow(void *hWnd)'),
      SetActiveWindow: user32.func('void * __stdcall SetActiveWindow(void *hWnd)'),
      ShowWindow: user32.func('bool __stdcall ShowWindow(void *hWnd, int nCmdShow)'),
      IsIconic: user32.func('bool __stdcall IsIconic(void *hWnd)'),
      IsWindow: user32.func('bool __stdcall IsWindow(void *hWnd)'),
      BringWindowToTop: user32.func('bool __stdcall BringWindowToTop(void *hWnd)'),
      SetWindowPos: user32.func(
        'bool __stdcall SetWindowPos(void *hWnd, void *hWndInsertAfter, int X, int Y, int cx, int cy, uint32 uFlags)'
      ),
      AllowSetForegroundWindow: user32.func(
        'bool __stdcall AllowSetForegroundWindow(uint32 dwProcessId)'
      ),
      LockSetForegroundWindow: user32.func(
        'bool __stdcall LockSetForegroundWindow(uint32 uLockCode)'
      ),
      SwitchToThisWindow: user32.func(
        'void __stdcall SwitchToThisWindow(void *hWnd, bool fAltTab)'
      ),
      SystemParametersInfoW: user32.func(
        'bool __stdcall SystemParametersInfoW(uint32 uiAction, uint32 uiParam, void *pvParam, uint32 fWinIni)'
      ),
      GetWindowThreadProcessId: user32.func(
        'uint32 __stdcall GetWindowThreadProcessId(void *hWnd, _Out_ uint32 *lpdwProcessId)'
      ),
      AttachThreadInput: user32.func(
        'bool __stdcall AttachThreadInput(uint32 idAttach, uint32 idAttachTo, bool fAttach)'
      ),
      GetCurrentThreadId: kernel32.func('uint32 __stdcall GetCurrentThreadId()'),
      GetGUIThreadInfo: user32.func(
        'bool __stdcall GetGUIThreadInfo(uint32 idThread, void *pgui)'
      ),
      SendMessageW: user32.func(
        'intptr __stdcall SendMessageW(void *hWnd, uint32 Msg, uintptr wParam, intptr lParam)'
      ),
      keybd_event: user32.func(
        'void __stdcall keybd_event(uint8 bVk, uint8 bScan, uint32 dwFlags, uintptr_t dwExtraInfo)'
      ),
      SendInput: user32.func('uint32 __stdcall SendInput(uint32 cInputs, void *pInputs, int cbSize)'),
      ptrSize,
      guiThreadInfoSize
    }
    return winApi
  } catch (err) {
    console.error('[focusTarget/win] koffi/user32 加载失败:', err)
    winApi = null
    return null
  }
}

function hwndAddress(h: Hwnd | null | undefined): bigint {
  if (h == null || h === 0 || h === 0n) return 0n
  const api = loadWinApi()
  if (!api) return 0n
  try {
    return BigInt(api.koffi.address(h))
  } catch {
    return 0n
  }
}

function hwndToToken(h: Hwnd | null | undefined): string | null {
  const n = hwndAddress(h)
  if (n === 0n) return null
  return `hwnd:${n.toString()}`
}

function tokenToHwnd(token: string): Hwnd | null {
  if (!token.startsWith('hwnd:')) return null
  const api = loadWinApi()
  if (!api) return null
  try {
    const n = BigInt(token.slice('hwnd:'.length))
    if (n === 0n) return null
    return api.koffi.as(n, 'void *')
  } catch {
    return null
  }
}

/** Electron getNativeWindowHandle → hwnd token */
function nativeHandleToToken(buf: Buffer): string | null {
  if (!buf?.length) return null
  const n =
    buf.length >= 8 ? buf.readBigUInt64LE(0) : BigInt(buf.readUInt32LE(0))
  if (n === 0n) return null
  return `hwnd:${n.toString()}`
}

function isOurHwnd(token: string): boolean {
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue
      const ours = nativeHandleToToken(win.getNativeWindowHandle())
      if (ours && ours === token) return true
    }
  } catch {
    /* ignore */
  }
  return false
}

/** 句柄是否属于本进程（含子窗；仅比顶层 BrowserWindow 更准） */
export function isOurProcessHwnd(token: string): boolean {
  if (isOurHwnd(token)) return true
  const api = loadWinApi()
  const h = tokenToHwnd(token)
  if (!api || !h) return false
  try {
    const pidBuf = Buffer.alloc(4)
    api.GetWindowThreadProcessId(h, pidBuf)
    return pidBuf.readUInt32LE(0) === process.pid
  } catch {
    return false
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** 同步采前台 hwnd（快捷键回调里尽早采，避免 show 后丢目标） */
export function captureWindowsForegroundHwnd(): string | null {
  const api = loadWinApi()
  if (!api) return null
  try {
    const h = api.GetForegroundWindow()
    const token = hwndToToken(h)
    if (!token) return null
    if (isOurProcessHwnd(token)) return null
    return token
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
  const api = loadWinApi()
  const h = tokenToHwnd(token)
  if (!api || !h) return
  try {
    api.LockSetForegroundWindow(2) // LSFW_UNLOCK
    const pidBuf = Buffer.alloc(4)
    api.GetWindowThreadProcessId(h, pidBuf)
    const pid = pidBuf.readUInt32LE(0)
    if (pid) api.AllowSetForegroundWindow(pid)
    api.AllowSetForegroundWindow(0xffffffff) // ASFW_ANY
  } catch (err) {
    console.error('[focusTarget/win] prepareWindowsFocusHandoff 失败:', err)
  }
}

/** 当前前台是否属于本进程（含子窗） */
export function isWindowsForegroundOurs(): boolean {
  const api = loadWinApi()
  if (!api) return false
  try {
    const fg = hwndToToken(api.GetForegroundWindow())
    return Boolean(fg && isOurProcessHwnd(fg))
  } catch {
    return false
  }
}

/** 当前前台是否已是目标 hwnd（或其同进程顶层窗） */
export function isWindowsForegroundTarget(token: string): boolean {
  if (!token.startsWith('hwnd:')) return false
  const api = loadWinApi()
  if (!api) return false
  try {
    const fg = api.GetForegroundWindow()
    const fgToken = hwndToToken(fg)
    if (!fgToken) return false
    if (fgToken === token) return true
    if (isOurProcessHwnd(fgToken)) return false
    const a = Buffer.alloc(4)
    const b = Buffer.alloc(4)
    const hTarget = tokenToHwnd(token)
    if (!hTarget || !fg) return false
    api.GetWindowThreadProcessId(hTarget, a)
    api.GetWindowThreadProcessId(fg, b)
    return a.readUInt32LE(0) !== 0 && a.readUInt32LE(0) === b.readUInt32LE(0)
  } catch {
    return false
  }
}

/** 临时把前台锁超时清零，提高 SetForegroundWindow 成功率 */
function withForegroundLockDisabled(api: WinApi, fn: () => void): void {
  const SPI_GETFOREGROUNDLOCKTIMEOUT = 0x2000
  const SPI_SETFOREGROUNDLOCKTIMEOUT = 0x2001
  const prev = Buffer.alloc(8)
  prev.writeUInt32LE(0, 0)
  let hadPrev = false
  try {
    hadPrev = !!api.SystemParametersInfoW(SPI_GETFOREGROUNDLOCKTIMEOUT, 0, prev, 0)
    const zero = Buffer.alloc(8)
    api.SystemParametersInfoW(SPI_SETFOREGROUNDLOCKTIMEOUT, 0, zero, 0)
    fn()
  } catch {
    fn()
  } finally {
    if (hadPrev) {
      try {
        api.SystemParametersInfoW(SPI_SETFOREGROUNDLOCKTIMEOUT, 0, prev, 0)
      } catch {
        /* ignore */
      }
    }
  }
}

/** 激活外部目标窗口（粘贴前） */
export function activateFocusTarget(token: string): boolean {
  if (!token.startsWith('hwnd:')) return false
  const api = loadWinApi()
  const h = tokenToHwnd(token)
  if (!api || !h) return false
  try {
    if (!api.IsWindow(h)) return false
    if (api.IsIconic(h)) api.ShowWindow(h, 9) // SW_RESTORE

    const targetPidBuf = Buffer.alloc(4)
    const targetTid = api.GetWindowThreadProcessId(h, targetPidBuf)
    const targetPid = targetPidBuf.readUInt32LE(0)
    if (targetPid) api.AllowSetForegroundWindow(targetPid)
    api.LockSetForegroundWindow(2)

    // Alt 空按，放宽前台限制
    api.keybd_event(0x12, 0, 0, 0)
    api.keybd_event(0x12, 0, 2, 0)

    const fg = api.GetForegroundWindow()
    const fgPidBuf = Buffer.alloc(4)
    const foreTid = fg ? api.GetWindowThreadProcessId(fg, fgPidBuf) : 0
    const curTid = api.GetCurrentThreadId()

    let attachedFore = false
    let attachedTarget = false
    if (foreTid && foreTid !== curTid) {
      attachedFore = !!api.AttachThreadInput(curTid, foreTid, 1)
    }
    if (targetTid && targetTid !== curTid && targetTid !== foreTid) {
      attachedTarget = !!api.AttachThreadInput(curTid, targetTid, 1)
    }
    // 前台线程与目标线程互挂，进一步放宽限制
    let attachedCross = false
    if (foreTid && targetTid && foreTid !== targetTid) {
      attachedCross = !!api.AttachThreadInput(foreTid, targetTid, 1)
    }

    withForegroundLockDisabled(api, () => {
      api.ShowWindow(h, 5) // SW_SHOW
      api.BringWindowToTop(h)
      api.SetWindowPos(h, 0, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0040)
      api.SetForegroundWindow(h)
      try {
        api.SetActiveWindow(h)
      } catch {
        /* ignore */
      }
    })

    if (attachedCross) api.AttachThreadInput(foreTid, targetTid, 0)
    if (attachedTarget) api.AttachThreadInput(curTid, targetTid, 0)
    if (attachedFore) api.AttachThreadInput(curTid, foreTid, 0)

    if (!isWindowsForegroundTarget(token)) {
      try {
        api.SwitchToThisWindow(h, 1)
      } catch {
        /* ignore */
      }
      api.SetForegroundWindow(h)
    }

    return isWindowsForegroundTarget(token)
  } catch (err) {
    console.error('[focusTarget/win] SetForegroundWindow 失败:', err)
    return false
  }
}

/**
 * 一律走 Ctrl+V（SendInput / keybd_event）。
 * 不用 WM_PASTE 抢先返回——VS Code / Chrome 等多数应用不吃 WM_PASTE，会误判成功却没贴上。
 */
export async function simulatePasteKey(): Promise<boolean> {
  const api = loadWinApi()

  try {
    await sleep(PRE_PASTE_DELAY_MS)
    // 前台仍在本进程时再等一小会（hide 还焦有延迟），仍不行才放弃
    if (isWindowsForegroundOurs()) {
      await sleep(120)
    }
    if (isWindowsForegroundOurs()) {
      console.warn('[focusTarget/win] 粘贴时前台仍是本进程，跳过模拟键')
      return false
    }

    if (api) {
      if (sendInputCtrlV(api)) return true

      releaseModifiers(api)
      await sleep(20)
      api.keybd_event(0x11, 0, 0, 0) // Ctrl down
      await sleep(20)
      api.keybd_event(0x56, 0, 0, 0) // V down
      await sleep(20)
      api.keybd_event(0x56, 0, 2, 0) // V up
      await sleep(20)
      api.keybd_event(0x11, 0, 2, 0) // Ctrl up
      return true
    }
    return await simulatePasteKeyPowershell()
  } catch (err) {
    console.error('[focusTarget/win] 模拟 Ctrl+V 失败:', err)
    return simulatePasteKeyPowershell()
  }
}

function releaseModifiers(api: WinApi): void {
  const KEYUP = 2
  for (const vk of [0x10, 0x11, 0x12]) {
    // Shift / Ctrl / Alt
    api.keybd_event(vk, 0, KEYUP, 0)
  }
}

/** koffi 不可用时的兜底：WScript.Shell SendKeys */
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

function sendInputCtrlV(api: WinApi): boolean {
  try {
    const KEYEVENTF_KEYUP = 0x0002
    const INPUT_KEYBOARD = 1
    const VK_SHIFT = 0x10
    const VK_CONTROL = 0x11
    const VK_MENU = 0x12
    const VK_V = 0x56

    // x64 INPUT = 40；x86 = 28
    const stride = api.ptrSize >= 8 ? 40 : 28
    // 先抬起修饰键，避免组合键状态异常
    const entries = [
      { vk: VK_SHIFT, up: true },
      { vk: VK_MENU, up: true },
      { vk: VK_CONTROL, up: true },
      { vk: VK_CONTROL, up: false },
      { vk: VK_V, up: false },
      { vk: VK_V, up: true },
      { vk: VK_CONTROL, up: true }
    ]
    const buf = Buffer.alloc(stride * entries.length)

    for (let i = 0; i < entries.length; i++) {
      const off = i * stride
      buf.writeUInt32LE(INPUT_KEYBOARD, off)
      const keyOff = api.ptrSize >= 8 ? off + 8 : off + 4
      buf.writeUInt16LE(entries[i]!.vk, keyOff)
      buf.writeUInt16LE(0, keyOff + 2)
      buf.writeUInt32LE(entries[i]!.up ? KEYEVENTF_KEYUP : 0, keyOff + 4)
    }

    const sent = api.SendInput(entries.length, buf, stride)
    return sent === entries.length
  } catch (err) {
    console.warn('[focusTarget/win] SendInput 不可用，将用 keybd_event:', err)
    return false
  }
}
