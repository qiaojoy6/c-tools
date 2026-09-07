import { normalizeRect, type AnnotStroke, type SelRect } from './tools'

const HIT_PAD = 8

/** 深拷贝一笔标注（点列独立） */
export function cloneStroke(s: AnnotStroke): AnnotStroke {
  if (s.kind === 'pen') {
    return { ...s, points: s.points.map((p) => ({ x: p.x, y: p.y })) }
  }
  return { ...s }
}

export function cloneStrokes(list: AnnotStroke[]): AnnotStroke[] {
  return list.map(cloneStroke)
}

/** 平移标注 */
export function translateStroke(s: AnnotStroke, dx: number, dy: number): AnnotStroke {
  const t = cloneStroke(s)
  if (t.kind === 'pen') {
    t.points = t.points.map((p) => ({ x: p.x + dx, y: p.y + dy }))
  } else if (t.kind === 'rect' || t.kind === 'mosaic') {
    t.x += dx
    t.y += dy
  } else if (t.kind === 'arrow') {
    t.x1 += dx
    t.y1 += dy
    t.x2 += dx
    t.y2 += dy
  }
  return t
}

/** 标注几何外包（无命中 padding，供选框/缩放） */
export function strokeGeomBounds(s: AnnotStroke): SelRect {
  if (s.kind === 'pen') {
    if (!s.points.length) return { x: 0, y: 0, w: 0, h: 0 }
    let minX = s.points[0]!.x
    let minY = s.points[0]!.y
    let maxX = minX
    let maxY = minY
    for (const p of s.points) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
    return {
      x: minX,
      y: minY,
      w: Math.max(1, maxX - minX),
      h: Math.max(1, maxY - minY)
    }
  }
  if (s.kind === 'rect' || s.kind === 'mosaic') {
    const r = normalizeRect(s.x, s.y, s.x + s.w, s.y + s.h)
    return { ...r, w: Math.max(1, r.w), h: Math.max(1, r.h) }
  }
  if (s.kind === 'arrow') {
    const r = normalizeRect(s.x1, s.y1, s.x2, s.y2)
    return { ...r, w: Math.max(1, r.w), h: Math.max(1, r.h) }
  }
  return { x: 0, y: 0, w: 0, h: 0 }
}

/** 标注外包矩形（含少量 padding，供框选相交） */
export function strokeBounds(s: AnnotStroke): SelRect {
  if (s.kind === 'pen') {
    const g = strokeGeomBounds(s)
    const pad = s.width / 2 + 2
    return {
      x: g.x - pad,
      y: g.y - pad,
      w: g.w + pad * 2,
      h: g.h + pad * 2
    }
  }
  if (s.kind === 'arrow') {
    const g = strokeGeomBounds(s)
    const pad = s.width / 2 + 4
    return {
      x: g.x - pad,
      y: g.y - pad,
      w: g.w + pad * 2,
      h: g.h + pad * 2
    }
  }
  return strokeGeomBounds(s)
}

/** 将标注从 from 框等比映射到 to 框（用于八向缩放） */
export function scaleStroke(s: AnnotStroke, from: SelRect, to: SelRect): AnnotStroke {
  const sx = from.w > 0 ? to.w / from.w : 1
  const sy = from.h > 0 ? to.h / from.h : 1
  const mapX = (x: number): number => to.x + (x - from.x) * sx
  const mapY = (y: number): number => to.y + (y - from.y) * sy

  if (s.kind === 'pen') {
    return {
      ...s,
      points: s.points.map((p) => ({ x: mapX(p.x), y: mapY(p.y) }))
    }
  }
  if (s.kind === 'rect' || s.kind === 'mosaic') {
    const x1 = mapX(s.x)
    const y1 = mapY(s.y)
    const x2 = mapX(s.x + s.w)
    const y2 = mapY(s.y + s.h)
    return { ...s, x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
  }
  return {
    ...s,
    x1: mapX(s.x1),
    y1: mapY(s.y1),
    x2: mapX(s.x2),
    y2: mapY(s.y2)
  }
}

function distToSeg(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const len2 = dx * dx + dy * dy
  if (len2 <= 0) return Math.hypot(px - x1, py - y1)
  let t = ((px - x1) * dx + (py - y1) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

function hitPolyline(
  points: Array<{ x: number; y: number }>,
  x: number,
  y: number,
  thresh: number
): boolean {
  if (points.length === 1) {
    return Math.hypot(x - points[0]!.x, y - points[0]!.y) <= thresh
  }
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    if (distToSeg(x, y, a.x, a.y, b.x, b.y) <= thresh) return true
  }
  return false
}

function insideRect(r: SelRect, x: number, y: number): boolean {
  return x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h
}

/** 点是否命中该笔描边（选区局部坐标；矩形仅边框，马赛克整块可点） */
export function hitStroke(s: AnnotStroke, x: number, y: number): boolean {
  if (s.kind === 'pen') {
    return hitPolyline(s.points, x, y, s.width / 2 + HIT_PAD)
  }
  if (s.kind === 'mosaic') {
    const r = normalizeRect(s.x, s.y, s.x + s.w, s.y + s.h)
    return insideRect(r, x, y)
  }
  if (s.kind === 'rect') {
    const r = normalizeRect(s.x, s.y, s.x + s.w, s.y + s.h)
    const t = s.width / 2 + HIT_PAD
    const outer = {
      x: r.x - t,
      y: r.y - t,
      w: r.w + t * 2,
      h: r.h + t * 2
    }
    const inner = {
      x: r.x + t,
      y: r.y + t,
      w: Math.max(0, r.w - t * 2),
      h: Math.max(0, r.h - t * 2)
    }
    if (inner.w < 4 || inner.h < 4) return insideRect(outer, x, y)
    return insideRect(outer, x, y) && !insideRect(inner, x, y)
  }
  if (s.kind === 'arrow') {
    return distToSeg(x, y, s.x1, s.y1, s.x2, s.y2) <= s.width / 2 + HIT_PAD
  }
  return false
}

/** 自上而下命中，返回索引；未中返回 -1 */
export function hitTopStroke(strokes: AnnotStroke[], x: number, y: number): number {
  for (let i = strokes.length - 1; i >= 0; i--) {
    if (hitStroke(strokes[i]!, x, y)) return i
  }
  return -1
}

function rectsIntersect(a: SelRect, b: SelRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/** 与框选矩形相交的标注下标 */
export function strokesInMarquee(strokes: AnnotStroke[], box: SelRect): number[] {
  if (box.w < 1 || box.h < 1) return []
  const out: number[] = []
  for (let i = 0; i < strokes.length; i++) {
    if (rectsIntersect(strokeBounds(strokes[i]!), box)) out.push(i)
  }
  return out
}
