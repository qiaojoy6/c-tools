/** 截屏标注工具（select = 框选/点选后移动已有标注） */
import { SCREENSHOT_UI } from '@shared/appTuning'

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

/** 线宽 range，数值见 appTuning.SCREENSHOT_UI.stroke（显式 number，避免 as const 字面量锁死 ref） */
export const STROKE_MIN: number = SCREENSHOT_UI.stroke.min
export const STROKE_MAX: number = SCREENSHOT_UI.stroke.max
export const STROKE_DEFAULT: number = SCREENSHOT_UI.stroke.default

/** 马赛克粒度 range，数值见 appTuning.SCREENSHOT_UI.mosaic */
export const MOSAIC_MIN: number = SCREENSHOT_UI.mosaic.min
export const MOSAIC_MAX: number = SCREENSHOT_UI.mosaic.max
export const MOSAIC_DEFAULT: number = SCREENSHOT_UI.mosaic.default

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
  // 前→后 = 顶层→下层：点落在谁露出来的区域，就选中谁的整窗 bounds
  for (const w of windows) {
    const b = w.bounds
    if (x >= b.x && y >= b.y && x <= b.x + b.width && y <= b.y + b.height) return b
  }
  return null
}

/** 工具条与选区/屏幕边缘的间距，数值见 appTuning.SCREENSHOT_UI */
export const DOCK_GAP = SCREENSHOT_UI.dockGap
export const DOCK_MARGIN = SCREENSHOT_UI.dockMargin

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
