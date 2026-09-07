import type { AnnotStroke, SelRect } from './tools'

/** 在选区坐标系下绘制全部标注 */
export function drawAnnotations(
  ctx: CanvasRenderingContext2D,
  strokes: AnnotStroke[],
  opts?: {
    mosaicSource?: CanvasImageSource
    /** 选区左上角在冻结图上的物理像素原点 */
    mosaicOrigin?: { x: number; y: number }
    /** DIP → 物理像素 */
    mosaicScale?: number
    /** 马赛克边框色 */
    mosaicBorder?: string
  }
): void {
  for (const s of strokes) {
    if (s.kind === 'pen') {
      if (s.points.length < 2) continue
      ctx.strokeStyle = s.color
      ctx.lineWidth = s.width
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(s.points[0]!.x, s.points[0]!.y)
      for (let i = 1; i < s.points.length; i++) {
        ctx.lineTo(s.points[i]!.x, s.points[i]!.y)
      }
      ctx.stroke()
    } else if (s.kind === 'rect') {
      ctx.strokeStyle = s.color
      ctx.lineWidth = s.width
      ctx.strokeRect(s.x, s.y, s.w, s.h)
    } else if (s.kind === 'arrow') {
      drawArrow(ctx, s.x1, s.y1, s.x2, s.y2, s.color, s.width)
    } else if (s.kind === 'mosaic') {
      paintMosaicMask(
        ctx,
        s,
        opts?.mosaicSource,
        opts?.mosaicOrigin,
        opts?.mosaicScale ?? 1,
        opts?.mosaicBorder ?? 'rgba(255,255,255,0.95)'
      )
    }
  }
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width: number
): void {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy)
  if (len < 1) return

  const angle = Math.atan2(dy, dx)
  const headLen = Math.min(len * 0.45, Math.max(12, width * 3.2))
  const wing = Math.PI / 6.5

  const bx = x2 - Math.cos(angle) * headLen * 0.72
  const by = y2 - Math.sin(angle) * headLen * 0.72

  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(bx, by)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - headLen * Math.cos(angle - wing), y2 - headLen * Math.sin(angle - wing))
  ctx.lineTo(x2 - headLen * Math.cos(angle + wing), y2 - headLen * Math.sin(angle + wing))
  ctx.closePath()
  ctx.fill()
}

/** 复用小画布：整块区域一次缩小再放大，形成实时马赛克遮罩 */
let mosaicScratch: HTMLCanvasElement | null = null
function getMosaicScratch(cw: number, ch: number): HTMLCanvasElement {
  if (!mosaicScratch) mosaicScratch = document.createElement('canvas')
  if (mosaicScratch.width !== cw || mosaicScratch.height !== ch) {
    mosaicScratch.width = cw
    mosaicScratch.height = ch
  }
  return mosaicScratch
}

/**
 * 马赛克遮罩：始终按当前位置从冻结图取样像素化（非快照贴纸）。
 * 先缩到格子数再放大，两次 drawImage，移动也跟手。
 */
function paintMosaicMask(
  ctx: CanvasRenderingContext2D,
  s: Extract<AnnotStroke, { kind: 'mosaic' }>,
  source?: CanvasImageSource,
  origin?: { x: number; y: number },
  scaleFactor = 1,
  border = 'rgba(255,255,255,0.95)'
): void {
  const r = {
    x: Math.min(s.x, s.x + s.w),
    y: Math.min(s.y, s.y + s.h),
    w: Math.abs(s.w),
    h: Math.abs(s.h)
  }
  if (r.w < 1 || r.h < 1) return

  // 无底图时至少挡住一块
  if (!source || s.size < 1) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(r.x, r.y, r.w, r.h)
    if (s.preview) strokeMosaicBorder(ctx, r, border)
    return
  }

  const sf = scaleFactor > 0 ? scaleFactor : 1
  const ox = origin?.x ?? 0
  const oy = origin?.y ?? 0
  const size = Math.max(1, s.size)
  const cellsW = Math.max(1, Math.ceil(r.w / size))
  const cellsH = Math.max(1, Math.ceil(r.h / size))

  const srcX = ox + r.x * sf
  const srcY = oy + r.y * sf
  const srcW = r.w * sf
  const srcH = r.h * sf

  const scratch = getMosaicScratch(cellsW, cellsH)
  const sctx = scratch.getContext('2d')
  if (!sctx) return

  try {
    sctx.imageSmoothingEnabled = true
    sctx.clearRect(0, 0, cellsW, cellsH)
    // 缩到「格子」分辨率 → 再无平滑放大，即当前位置的像素遮挡
    sctx.drawImage(source, srcX, srcY, srcW, srcH, 0, 0, cellsW, cellsH)

    const prev = ctx.imageSmoothingEnabled
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(scratch, 0, 0, cellsW, cellsH, r.x, r.y, r.w, r.h)
    ctx.imageSmoothingEnabled = prev
  } catch {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(r.x, r.y, r.w, r.h)
  }

  // 仅框选拖拽过程中画边框，定稿后不要边
  if (s.preview) strokeMosaicBorder(ctx, r, border)
}

function strokeMosaicBorder(
  ctx: CanvasRenderingContext2D,
  r: SelRect,
  border: string
): void {
  ctx.save()
  ctx.setLineDash([])
  ctx.lineWidth = 2
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.strokeRect(r.x + 1, r.y + 1, Math.max(0, r.w - 2), Math.max(0, r.h - 2))
  ctx.lineWidth = 1.25
  ctx.strokeStyle = border
  ctx.strokeRect(r.x + 1, r.y + 1, Math.max(0, r.w - 2), Math.max(0, r.h - 2))
  ctx.restore()
}

/** 规范化马赛克矩形（正宽高），并结束框选预览态 */
export function normalizeMosaicStroke(s: Extract<AnnotStroke, { kind: 'mosaic' }>): void {
  const x = Math.min(s.x, s.x + s.w)
  const y = Math.min(s.y, s.y + s.h)
  const w = Math.abs(s.w)
  const h = Math.abs(s.h)
  s.x = x
  s.y = y
  s.w = w
  s.h = h
  s.preview = false
}

/** 导出选区 PNG（含标注），返回去掉 data URL 前缀的 base64 */
export async function exportSelectionPng(
  bg: HTMLImageElement,
  sel: SelRect,
  strokes: AnnotStroke[],
  scaleFactor: number
): Promise<string> {
  const canvas = document.createElement('canvas')
  const pw = Math.max(1, Math.round(sel.w * scaleFactor))
  const ph = Math.max(1, Math.round(sel.h * scaleFactor))
  canvas.width = pw
  canvas.height = ph
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  try {
    ctx.drawImage(
      bg,
      Math.round(sel.x * scaleFactor),
      Math.round(sel.y * scaleFactor),
      pw,
      ph,
      0,
      0,
      pw,
      ph
    )

    ctx.save()
    ctx.scale(scaleFactor, scaleFactor)
    drawAnnotations(ctx, strokes, {
      mosaicSource: bg,
      mosaicOrigin: { x: sel.x * scaleFactor, y: sel.y * scaleFactor },
      mosaicScale: scaleFactor
    })
    ctx.restore()

    const dataUrl = canvas.toDataURL('image/png')
    return dataUrl.replace(/^data:image\/png;base64,/, '')
  } catch (err) {
    console.error('[screenshot] exportSelectionPng failed:', err)
    return ''
  }
}
