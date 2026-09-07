import { normalizeRect, type SelRect } from './tools'

export const HANDLE_HIT = 8
export const ANNOT_MIN = 8

export const HANDLE_CURSOR: Record<string, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize'
}

export function handlePoints(r: SelRect): Record<string, { x: number; y: number }> {
  return {
    nw: { x: r.x, y: r.y },
    n: { x: r.x + r.w / 2, y: r.y },
    ne: { x: r.x + r.w, y: r.y },
    e: { x: r.x + r.w, y: r.y + r.h / 2 },
    se: { x: r.x + r.w, y: r.y + r.h },
    s: { x: r.x + r.w / 2, y: r.y + r.h },
    sw: { x: r.x, y: r.y + r.h },
    w: { x: r.x, y: r.y + r.h / 2 }
  }
}

export function hitHandle(r: SelRect, x: number, y: number): string | null {
  const hs = handlePoints(r)
  for (const [k, p] of Object.entries(hs)) {
    if (Math.hypot(x - p.x, y - p.y) <= HANDLE_HIT) return k
  }
  return null
}

export function insideSel(r: SelRect, x: number, y: number): boolean {
  return x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h
}

/** 夹到屏幕 bounds */
export function clampSel(r: SelRect, boundsW: number, boundsH: number): SelRect {
  const x = Math.min(Math.max(0, r.x), boundsW - 1)
  const y = Math.min(Math.max(0, r.y), boundsH - 1)
  return {
    x,
    y,
    w: Math.min(r.w, boundsW - x),
    h: Math.min(r.h, boundsH - y)
  }
}

/** 平移选区并限制在屏幕内 */
export function clampMove(
  base: SelRect,
  dx: number,
  dy: number,
  boundsW: number,
  boundsH: number
): SelRect {
  return {
    x: Math.min(Math.max(0, base.x + dx), Math.max(0, boundsW - base.w)),
    y: Math.min(Math.max(0, base.y + dy), Math.max(0, boundsH - base.h)),
    w: base.w,
    h: base.h
  }
}

export function resizeByHandle(
  base: SelRect,
  handle: string,
  x: number,
  y: number,
  boundsW: number,
  boundsH: number
): SelRect {
  let { x: bx, y: by, w, h } = base
  const r = bx + w
  const b = by + h
  if (handle.includes('w')) bx = x
  if (handle.includes('n')) by = y
  if (handle.includes('e')) w = x - (handle.includes('w') ? bx : base.x)
  else if (handle.includes('w')) w = r - bx
  if (handle.includes('s')) h = y - (handle.includes('n') ? by : base.y)
  else if (handle.includes('n')) h = b - by
  return clampSel(normalizeRect(bx, by, bx + w, by + h), boundsW, boundsH)
}

/** 标注局部坐标缩放（不夹到屏幕，保证最小尺寸） */
export function resizeBoundsLocal(base: SelRect, handle: string, x: number, y: number): SelRect {
  let { x: bx, y: by, w, h } = base
  const right = bx + w
  const bottom = by + h
  if (handle.includes('w')) bx = x
  if (handle.includes('n')) by = y
  if (handle.includes('e')) w = x - (handle.includes('w') ? bx : base.x)
  else if (handle.includes('w')) w = right - bx
  if (handle.includes('s')) h = y - (handle.includes('n') ? by : base.y)
  else if (handle.includes('n')) h = bottom - by
  let r = normalizeRect(bx, by, bx + w, by + h)
  if (r.w < ANNOT_MIN) {
    if (handle.includes('w')) r = { ...r, x: r.x + r.w - ANNOT_MIN, w: ANNOT_MIN }
    else r = { ...r, w: ANNOT_MIN }
  }
  if (r.h < ANNOT_MIN) {
    if (handle.includes('n')) r = { ...r, y: r.y + r.h - ANNOT_MIN, h: ANNOT_MIN }
    else r = { ...r, h: ANNOT_MIN }
  }
  return r
}
