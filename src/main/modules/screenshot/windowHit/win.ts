/**
 * Windows：只枚举看得见的顶层应用窗（无 owner 的可见窗），不收集子窗/工具浮层。
 */
import type { ShotWindowInfo } from '@shared/types'

type Hwnd = unknown

type KoffiModule = typeof import('koffi')

type Api = {
  koffi: KoffiModule
  EnumWindows: (cb: unknown, lp: number) => number
  IsWindowVisible: (h: Hwnd) => number
  IsIconic: (h: Hwnd) => number
  GetWindow: (h: Hwnd, cmd: number) => Hwnd
  GetWindowRect: (
    h: Hwnd,
    rect: { left: number; top: number; right: number; bottom: number }
  ) => number
  GetWindowTextLengthW: (h: Hwnd) => number
  GetWindowTextW: (h: Hwnd, buf: Buffer, max: number) => number
  GetWindowLongW: (h: Hwnd, idx: number) => number
  GetClassNameW: (h: Hwnd, buf: Buffer, max: number) => number
  proto: ReturnType<KoffiModule['proto']>
}

let api: Api | null | undefined

function load(): Api | null {
  if (api !== undefined) return api
  if (process.platform !== 'win32') {
    api = null
    return null
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi = require('koffi') as typeof import('koffi')
    const user32 = koffi.load('user32.dll')
    koffi.struct('SHOT_RECT', {
      left: 'long',
      top: 'long',
      right: 'long',
      bottom: 'long'
    })
    const proto = koffi.proto('bool __stdcall SHOT_WNDENUMPROC(void *hwnd, intptr_t lParam)')
    api = {
      koffi,
      proto,
      EnumWindows: user32.func(
        'bool __stdcall EnumWindows(SHOT_WNDENUMPROC *lpEnumFunc, intptr_t lParam)'
      ),
      IsWindowVisible: user32.func('bool __stdcall IsWindowVisible(void *hWnd)'),
      IsIconic: user32.func('bool __stdcall IsIconic(void *hWnd)'),
      GetWindow: user32.func('void * __stdcall GetWindow(void *hWnd, uint32 uCmd)'),
      GetWindowRect: user32.func('bool __stdcall GetWindowRect(void *hWnd, _Out_ SHOT_RECT *lpRect)'),
      GetWindowTextLengthW: user32.func('int __stdcall GetWindowTextLengthW(void *hWnd)'),
      GetWindowTextW: user32.func(
        'int __stdcall GetWindowTextW(void *hWnd, void *lpString, int nMaxCount)'
      ),
      GetWindowLongW: user32.func('long __stdcall GetWindowLongW(void *hWnd, int nIndex)'),
      GetClassNameW: user32.func(
        'int __stdcall GetClassNameW(void *hWnd, void *lpClassName, int nMaxCount)'
      )
    }
    return api
  } catch (err) {
    console.warn('[screenshot] win window api failed:', err)
    api = null
    return null
  }
}

function hwndAddr(a: Api, hwnd: Hwnd): string {
  try {
    return String(a.koffi.address(hwnd as object))
  } catch {
    return String(hwnd)
  }
}

function isNullHwnd(a: Api, hwnd: Hwnd): boolean {
  try {
    return Number(a.koffi.address(hwnd as object)) === 0
  } catch {
    return !hwnd
  }
}

export function listWindowsWin(): ShotWindowInfo[] {
  const a = load()
  if (!a) return []

  const result: ShotWindowInfo[] = []
  const GWL_EXSTYLE = -20
  const GWL_STYLE = -16
  const WS_EX_TOOLWINDOW = 0x00000080
  const WS_EX_APPWINDOW = 0x00040000
  const WS_EX_NOACTIVATE = 0x08000000
  const WS_CHILD = 0x40000000
  const GW_OWNER = 4

  const cb = a.koffi.register((hwnd: Hwnd) => {
    try {
      if (!a.IsWindowVisible(hwnd) || a.IsIconic(hwnd)) return true

      // 只要顶层应用窗：有 owner 的是附属窗，跳过
      const owner = a.GetWindow(hwnd, GW_OWNER)
      if (!isNullHwnd(a, owner)) return true

      const style = a.GetWindowLongW(hwnd, GWL_STYLE)
      if (style & WS_CHILD) return true

      const ex = a.GetWindowLongW(hwnd, GWL_EXSTYLE)
      if (ex & WS_EX_NOACTIVATE) return true
      if (ex & WS_EX_TOOLWINDOW && !(ex & WS_EX_APPWINDOW)) return true

      const classBuf = Buffer.alloc(256)
      a.GetClassNameW(hwnd, classBuf, 128)
      const className = classBuf.toString('utf16le').replace(/\0.*$/, '')
      if (
        className === 'Shell_TrayWnd' ||
        className === 'Shell_SecondaryTrayWnd' ||
        className === 'Progman' ||
        className === 'WorkerW' ||
        className === 'Windows.UI.Core.CoreWindow'
      ) {
        return true
      }

      const rect = { left: 0, top: 0, right: 0, bottom: 0 }
      if (!a.GetWindowRect(hwnd, rect)) return true
      const width = rect.right - rect.left
      const height = rect.bottom - rect.top
      // 看得见的软件主区域，过滤小浮层
      if (width < 120 || height < 80) return true

      const len = a.GetWindowTextLengthW(hwnd)
      let title = ''
      if (len > 0) {
        const buf = Buffer.alloc((len + 1) * 2)
        a.GetWindowTextW(hwnd, buf, len + 1)
        title = buf.toString('utf16le').replace(/\0.*$/, '')
      }
      // 无标题的顶层窗多为不可见壳，跳过
      if (!title.trim()) return true

      result.push({
        id: hwndAddr(a, hwnd),
        title,
        bounds: { x: rect.left, y: rect.top, width, height }
      })
    } catch {
      /* skip */
    }
    return true
  }, a.proto)

  try {
    a.EnumWindows(cb, 0)
  } finally {
    a.koffi.unregister(cb)
  }
  return result
}
