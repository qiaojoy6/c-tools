/** 截屏标注工具（select = 框选/点选后移动已有标注） */
export type AnnotTool = 'select' | 'pen' | 'rect' | 'arrow' | 'mosaic'

export const ANNOT_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#3b82f6',
  '#a855f7',
  '#ffffff',
  '#111827'
] as const

/** 线宽 range：1–20，默认 3 */
export const STROKE_MIN = 1
export const STROKE_MAX = 20
export const STROKE_DEFAULT = 3

/** 马赛克粒度 range：2–10，默认 6 */
export const MOSAIC_MIN = 2
export const MOSAIC_MAX = 10
export const MOSAIC_DEFAULT = 6

export type AnnotStroke =
  | {
      kind: 'pen'
      color: string
      width: number
      points: Array<{ x: number; y: number }>
    }
  | {
      kind: 'rect'
      color: string
      width: number
      x: number
      y: number
      w: number
      h: number
    }
  | {
      kind: 'arrow'
      color: string
      width: number
      x1: number
      y1: number
      x2: number
      y2: number
    }
  | {
      /** 框选区域马赛克遮罩；size 为像素块边长（DIP） */
      kind: 'mosaic'
      size: number
      x: number
      y: number
      w: number
      h: number
      /** 正在框选中：画辅助边框 */
      preview?: boolean
    }

export interface SelRect {
  x: number
  y: number
  w: number
  h: number
}

export function normalizeRect(x0: number, y0: number, x1: number, y1: number): SelRect {
  const x = Math.min(x0, x1)
  const y = Math.min(y0, y1)
  return { x, y, w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) }
}

export function hitWindow(
  windows: Array<{ bounds: { x: number; y: number; width: number; height: number } }>,
  x: number,
  y: number
): { x: number; y: number; width: number; height: number } | null {
  // 列表按面积从大到小，从后往前找更小的上层窗
  for (let i = windows.length - 1; i >= 0; i--) {
    const b = windows[i]!.bounds
    if (x >= b.x && y >= b.y && x <= b.x + b.width && y <= b.y + b.height) return b
  }
  return null
}

/** 工具条与选区/屏幕边缘的间距 */
export const DOCK_GAP = 10
export const DOCK_MARGIN = 8

/**
 * 工具条自动落位（客户区坐标）：优先选区下方 → 上方 → 选区内贴近底边。
 * sel 为 bounds 坐标；vp 为客户区相对 bounds 的偏移。
 */
export function placeDock(
  sel: SelRect,
  vp: { x: number; y: number },
  work: { width: number; height: number },
  dock: { w: number; h: number }
): { left: number; top: number } {
  const sx = sel.x - vp.x
  const sy = sel.y - vp.y
  const left = Math.max(
    DOCK_MARGIN,
    Math.min(sx, work.width - dock.w - DOCK_MARGIN)
  )

  // 下方：选区底边 + 间隙
  const below = sy + sel.h + DOCK_GAP
  if (below + dock.h <= work.height - DOCK_MARGIN) {
    return { left, top: below }
  }

  // 上方：选区顶边 - 间隙 - 工具条高
  const above = sy - DOCK_GAP - dock.h
  if (above >= DOCK_MARGIN) {
    return { left, top: above }
  }

  // 内侧：贴选区底边内侧，再钳到屏幕
  const inside = sy + sel.h - dock.h - DOCK_GAP
  return {
    left,
    top: Math.max(DOCK_MARGIN, Math.min(inside, work.height - dock.h - DOCK_MARGIN))
  }
}
