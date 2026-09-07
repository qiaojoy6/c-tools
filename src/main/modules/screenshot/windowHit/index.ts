import { screen } from 'electron'
import type { ShotRect, ShotWindowInfo } from '@shared/types'
import { listWindowsMac } from './mac'
import { listWindowsWin } from './win'

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

/** 枚举可点选窗口（屏幕 DIP 坐标）；失败返回 [] */
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

/** 把全局 DIP 矩形裁到某块屏的本地坐标（原点=屏左上） */
export function windowsOnDisplay(
  windows: ShotWindowInfo[],
  displayBounds: ShotRect
): ShotWindowInfo[] {
  const out: ShotWindowInfo[] = []
  for (const w of windows) {
    const x = w.bounds.x - displayBounds.x
    const y = w.bounds.y - displayBounds.y
    // 与屏有交集才保留
    if (x + w.bounds.width <= 0 || y + w.bounds.height <= 0) continue
    if (x >= displayBounds.width || y >= displayBounds.height) continue
    out.push({
      ...w,
      bounds: { x, y, width: w.bounds.width, height: w.bounds.height }
    })
  }
  // 面积大的在下、小的在上：悬停优先命中上层小窗 —— 列表按面积升序，命中时从后往前找
  out.sort((a, b) => b.bounds.width * b.bounds.height - a.bounds.width * a.bounds.height)
  return out
}
