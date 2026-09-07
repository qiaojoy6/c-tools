import { screen } from 'electron'
import type { ShotRect, ShotWindowInfo } from '@shared/types'
import { listWindowsMac } from './mac'
import { listWindowsWin } from './win'

/** 两矩形相交；无交集返回 null */
function intersectRects(a: ShotRect, b: ShotRect): ShotRect | null {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.width, b.x + b.width)
  const y2 = Math.min(a.y + a.height, b.y + b.height)
  const width = x2 - x1
  const height = y2 - y1
  if (width <= 0 || height <= 0) return null
  return { x: x1, y: y1, width, height }
}

/** 将可能为物理像素的矩形转为与 Electron display.bounds 一致的 DIP */
function toDipBounds(bounds: ShotRect): ShotRect {
  if (process.platform !== 'win32') return bounds
  try {
    const tl = screen.screenToDipPoint({ x: bounds.x, y: bounds.y })
    const br = screen.screenToDipPoint({
      x: bounds.x + bounds.width,
      y: bounds.y + bounds.height
    })
    return {
      x: Math.round(tl.x),
      y: Math.round(tl.y),
      width: Math.max(1, Math.round(br.x - tl.x)),
      height: Math.max(1, Math.round(br.y - tl.y))
    }
  } catch {
    return bounds
  }
}

/** 枚举可点选窗口（屏幕 DIP 坐标，前→后 = 顶层→下层）；失败返回 [] */
export async function listAppWindows(): Promise<ShotWindowInfo[]> {
  let raw: ShotWindowInfo[] = []
  if (process.platform === 'darwin') {
    raw = await listWindowsMac()
  } else if (process.platform === 'win32') {
    raw = listWindowsWin()
  }
  return raw.map((w) => ({
    ...w,
    bounds: toDipBounds(w.bounds)
  }))
}

/**
 * 裁到某块屏的本地坐标。
 * - 屏外部分去掉（本屏看不到的不计入）
 * - bounds 仍是整窗在本屏上的外接矩形（选中 = 整个应用，不是被挡住后的碎片）
 * - 顺序保持顶层→下层，悬停时点在露出来的区域才命中上层/下层
 */
export function windowsOnDisplay(
  windows: ShotWindowInfo[],
  displayBounds: ShotRect
): ShotWindowInfo[] {
  const screenLocal: ShotRect = {
    x: 0,
    y: 0,
    width: displayBounds.width,
    height: displayBounds.height
  }
  const out: ShotWindowInfo[] = []
  for (const w of windows) {
    const local: ShotRect = {
      x: w.bounds.x - displayBounds.x,
      y: w.bounds.y - displayBounds.y,
      width: w.bounds.width,
      height: w.bounds.height
    }
    const clipped = intersectRects(local, screenLocal)
    if (!clipped) continue
    out.push({ ...w, bounds: clipped })
  }
  return out
}
