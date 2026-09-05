/**
 * 前台目标采集 / 激活 / Windows 模拟粘贴
 * - macOS：osascript（bundle id）
 * - Windows：主进程 koffi 调 user32（避免 PowerShell 超时导致双击粘贴失败）
 */
import { execFile, execFileSync } from 'child_process'
import { app, BrowserWindow } from 'electron'

const CAPTURE_TIMEOUT_MS = 320

let ownBundleId: string | null | undefined

/** koffi 返回的 HWND 为 opaque pointer；用 address 转成可比较的数字 */
type Hwnd = unknown

type WinApi = {
  koffi: typeof import('koffi')
  GetForegroundWindow: () => Hwnd
  SetForegroundWindow: (h: Hwnd) => number
  ShowWindow: (h: Hwnd, n: number) => number
  IsIconic: (h: Hwnd) => number
  BringWindowToTop: (h: Hwnd) => number
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
  if (process.platform !== 'win32') return null
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
      ShowWindow: user32.func('bool __stdcall ShowWindow(void *hWnd, int nCmdShow)'),
      IsIconic: user32.func('bool __stdcall IsIconic(void *hWnd)'),
      BringWindowToTop: user32.func('bool __stdcall BringWindowToTop(void *hWnd)'),
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
    console.error('[focusTarget] koffi/user32 加载失败:', err)
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** ---------- macOS ---------- */

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
 * - Windows：`hwnd:<句柄>`（排除本应用窗口）
 */
export function getFrontmostBundleId(_timeoutMs = CAPTURE_TIMEOUT_MS): Promise<string | null> {
  if (process.platform === 'darwin') {
    return new Promise((resolve) => {
      execFile(
        'osascript',
        [
          '-e',
          'tell application "System Events" to get bundle identifier of first application process whose frontmost is true'
        ],
        { encoding: 'utf8', timeout: Math.max(_timeoutMs, 800) },
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
    return Promise.resolve(captureWindowsForegroundHwnd())
  }

  return Promise.resolve(null)
}

function captureWindowsForegroundHwnd(): string | null {
  const api = loadWinApi()
  if (!api) return null
  try {
    const h = api.GetForegroundWindow()
    const token = hwndToToken(h)
    if (!token) return null
    if (isOurHwnd(token)) return null
    return token
  } catch (err) {
    console.error('[focusTarget] GetForegroundWindow 失败:', err)
    return null
  }
}

export function isOwnBundleId(bundleId: string | null | undefined): boolean {
  if (!bundleId) return false
  if (bundleId.startsWith('hwnd:')) return isOurHwnd(bundleId)
  const own = getOwnBundleId()
  if (own && bundleId === own) return true
  if (bundleId === 'com.github.Electron' || bundleId === 'com.electron.app') return true
  if (!app.isPackaged && bundleId.includes('Electron')) return true
  return false
}

export function asExternalBundleId(bundleId: string | null | undefined): string | null {
  if (!bundleId || isOwnBundleId(bundleId)) return null
  return bundleId
}

/** 激活外部目标窗口（粘贴前） */
export async function activateFocusTarget(target: string): Promise<boolean> {
  if (process.platform === 'darwin') {
    return new Promise((resolve) => {
      execFile(
        'osascript',
        ['-e', `tell application id "${target}" to activate`],
        (err) => resolve(!err)
      )
    })
  }

  if (process.platform === 'win32' && target.startsWith('hwnd:')) {
    return activateWindowsHwnd(target)
  }

  return false
}

function activateWindowsHwnd(token: string): boolean {
  const api = loadWinApi()
  const h = tokenToHwnd(token)
  if (!api || !h) return false
  try {
    if (api.IsIconic(h)) api.ShowWindow(h, 9) // SW_RESTORE
    // Alt 空按，放宽 SetForegroundWindow 前台限制
    api.keybd_event(0x12, 0, 0, 0)
    api.keybd_event(0x12, 0, 2, 0)

    const fg = api.GetForegroundWindow()
    const pidBuf = Buffer.alloc(4)
    const foreTid = fg ? api.GetWindowThreadProcessId(fg, pidBuf) : 0
    const curTid = api.GetCurrentThreadId()
    let attached = false
    if (foreTid && foreTid !== curTid) {
      attached = !!api.AttachThreadInput(curTid, foreTid, 1)
    }
    api.ShowWindow(h, 5) // SW_SHOW
    api.BringWindowToTop(h)
    const ok = !!api.SetForegroundWindow(h)
    if (attached) api.AttachThreadInput(curTid, foreTid, 0)
    return ok
  } catch (err) {
    console.error('[focusTarget] SetForegroundWindow 失败:', err)
    return false
  }
}

/** 当前前台是否仍是本应用窗口（隐藏浮层后若仍为 true，Ctrl+V 会无效） */
export function isOurAppForeground(): boolean {
  if (process.platform !== 'win32') return false
  const api = loadWinApi()
  if (!api) return false
  try {
    const token = hwndToToken(api.GetForegroundWindow())
    return Boolean(token && isOurHwnd(token))
  } catch {
    return false
  }
}

/**
 * Windows 粘贴：优先 WM_PASTE 到焦点控件，再 SendInput Ctrl+V。
 * 任一步成功即 true；全失败返回 false（供上层提示，不再假装成功）。
 */
export async function simulateWindowsPasteKey(): Promise<boolean> {
  if (process.platform !== 'win32') return false
  const api = loadWinApi()
  if (!api) return false

  try {
    await sleep(40)
    if (sendWmPaste(api)) return true
    if (sendInputCtrlV(api)) {
      // SendInput 计数成功但前台仍是本应用 → 键没落到外部
      return !isOurAppForeground()
    }

    api.keybd_event(0x11, 0, 0, 0)
    await sleep(15)
    api.keybd_event(0x56, 0, 0, 0)
    await sleep(15)
    api.keybd_event(0x56, 0, 2, 0)
    await sleep(15)
    api.keybd_event(0x11, 0, 2, 0)
    await sleep(20)
    return !isOurAppForeground()
  } catch (err) {
    console.error('[focusTarget] 模拟 Ctrl+V 失败:', err)
    return false
  }
}

/** 向当前焦点控件发 WM_PASTE（比模拟按键更稳） */
function sendWmPaste(api: WinApi): boolean {
  try {
    const WM_PASTE = 0x0302
    const info = Buffer.alloc(Math.max(api.guiThreadInfoSize, 72))
    info.writeUInt32LE(api.guiThreadInfoSize, 0)
    if (!api.GetGUIThreadInfo(0, info)) return false

    // hwndFocus @ 8+ptrSize；hwndActive @ 8
    const focusOff = 8 + api.ptrSize
    const focusAddr =
      api.ptrSize >= 8 ? info.readBigUInt64LE(focusOff) : BigInt(info.readUInt32LE(focusOff))
    const activeOff = 8
    const activeAddr =
      api.ptrSize >= 8 ? info.readBigUInt64LE(activeOff) : BigInt(info.readUInt32LE(activeOff))
    const targetAddr = focusAddr !== 0n ? focusAddr : activeAddr
    if (targetAddr === 0n) return false

    const token = `hwnd:${targetAddr.toString()}`
    if (isOurHwnd(token)) return false

    const h = api.koffi.as(targetAddr, 'void *')
    api.SendMessageW(h, WM_PASTE, 0, 0)
    return true
  } catch (err) {
    console.warn('[focusTarget] WM_PASTE 失败:', err)
    return false
  }
}

function sendInputCtrlV(api: WinApi): boolean {
  try {
    const KEYEVENTF_KEYUP = 0x0002
    const INPUT_KEYBOARD = 1
    const VK_CONTROL = 0x11
    const VK_V = 0x56

    // x64 INPUT = 40；x86 = 28
    const stride = api.ptrSize >= 8 ? 40 : 28
    const entries = [
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
    console.warn('[focusTarget] SendInput 不可用，将用 keybd_event:', err)
    return false
  }
}
