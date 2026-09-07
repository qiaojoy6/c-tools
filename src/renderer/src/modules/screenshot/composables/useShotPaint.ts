import type { ShotOverlayInit, ShotWindowInfo } from '@shared/types'
import { ref, watch, type Ref } from 'vue'
import { strokeGeomBounds } from '../annotGeom'
import { drawAnnotations } from '../draw'
import { handlePoints } from '../selGeom'
import type { AnnotStroke, SelRect } from '../tools'

/** 读取主题色，选区描边与设置页主色一致 */
function themeColor(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

export interface ShotPaintDeps {
  init: Ref<ShotOverlayInit | null>
  phase: Ref<'select' | 'edit'>
  sel: Ref<SelRect | null>
  draft: Ref<SelRect | null>
  hoverWin: Ref<ShotWindowInfo['bounds'] | null>
  strokes: Ref<AnnotStroke[]>
  selectedIdx: Ref<number[]>
  annotMarquee: Ref<SelRect | null>
  canAdjust: Ref<boolean>
  bgImg: Ref<HTMLImageElement | null>
}

/**
 * 截屏遮罩 canvas：暗幕挖洞、标注与选框绘制
 */
export function useShotPaint(deps: ShotPaintDeps) {
  const overlayCanvas = ref<HTMLCanvasElement | null>(null)

  function drawHandles(ctx: CanvasRenderingContext2D, r: SelRect, accent: string): void {
    const hs = handlePoints(r)
    const fill = themeColor('--card', '#fff')
    const radius = 4.5
    ctx.fillStyle = fill
    ctx.strokeStyle = accent
    ctx.lineWidth = 1.5
    for (const p of Object.values(hs)) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
  }

  function drawAnnotSelection(
    ctx: CanvasRenderingContext2D,
    b: SelRect,
    accent: string,
    withHandles: boolean
  ): void {
    const x = b.x + 0.5
    const y = b.y + 0.5
    const w = Math.max(0, b.w - 1)
    const h = Math.max(0, b.h - 1)
    ctx.save()
    ctx.setLineDash([7, 4])
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)'
    ctx.strokeRect(x, y, w, h)
    ctx.lineWidth = 1.75
    ctx.strokeStyle = accent
    ctx.strokeRect(x, y, w, h)
    ctx.restore()
    if (withHandles) drawHandles(ctx, b, accent)
  }

  function drawSizeLabel(ctx: CanvasRenderingContext2D, r: SelRect): void {
    const text = `${Math.round(r.w)} × ${Math.round(r.h)}`
    const card = themeColor('--card', 'oklch(0.29 0.014 265)')
    const fg = themeColor('--foreground', 'oklch(0.9 0.008 255)')
    ctx.font = '500 12px ui-sans-serif, system-ui, sans-serif'
    const padX = 10
    const padY = 4
    const tw = ctx.measureText(text).width
    const th = 16
    const boxW = tw + padX * 2
    const boxH = th + padY * 2
    const x = r.x
    const y = r.y >= boxH + 4 ? r.y - boxH - 2 : r.y + 4
    ctx.fillStyle = card
    ctx.globalAlpha = 0.92
    ctx.beginPath()
    ctx.roundRect(x, y, boxW, boxH, 8)
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.fillStyle = fg
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x + padX, y + boxH / 2)
  }

  function paint(): void {
    const canvas = overlayCanvas.value
    const root = deps.init.value
    if (!canvas || !root) return
    const bw = root.bounds.width
    const bh = root.bounds.height
    // 避免每帧重置宽高（会清空缓冲、触发同步重分配）
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw
      canvas.height = bh
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    ctx.fillStyle = 'rgba(0,0,0,0.42)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const accent = themeColor('--ring', 'oklch(0.55 0.04 265)')
    const clear = deps.draft.value || deps.sel.value
    const win =
      !clear && deps.hoverWin.value
        ? {
            x: deps.hoverWin.value.x,
            y: deps.hoverWin.value.y,
            w: deps.hoverWin.value.width,
            h: deps.hoverWin.value.height
          }
        : null
    const hole = clear || win
    if (hole && hole.w > 0 && hole.h > 0) {
      ctx.clearRect(hole.x, hole.y, hole.w, hole.h)
      ctx.strokeStyle = accent
      ctx.lineWidth = 2
      ctx.strokeRect(hole.x + 1, hole.y + 1, hole.w - 2, hole.h - 2)
      drawSizeLabel(ctx, hole)
    }

    if (deps.sel.value && deps.phase.value === 'edit') {
      ctx.save()
      ctx.beginPath()
      ctx.rect(deps.sel.value.x, deps.sel.value.y, deps.sel.value.w, deps.sel.value.h)
      ctx.clip()
      ctx.translate(deps.sel.value.x, deps.sel.value.y)
      drawAnnotations(ctx, deps.strokes.value, {
        mosaicSource: deps.bgImg.value ?? undefined,
        mosaicOrigin: {
          x: deps.sel.value.x * root.scaleFactor,
          y: deps.sel.value.y * root.scaleFactor
        },
        mosaicScale: root.scaleFactor,
        mosaicBorder: accent
      })
      if (deps.selectedIdx.value.length) {
        for (const i of deps.selectedIdx.value) {
          const s = deps.strokes.value[i]
          if (!s) continue
          drawAnnotSelection(
            ctx,
            strokeGeomBounds(s),
            accent,
            deps.selectedIdx.value.length === 1
          )
        }
      }
      if (
        deps.annotMarquee.value &&
        deps.annotMarquee.value.w > 0 &&
        deps.annotMarquee.value.h > 0
      ) {
        const m = deps.annotMarquee.value
        ctx.save()
        ctx.fillStyle = 'rgba(59, 130, 246, 0.15)'
        ctx.strokeStyle = accent
        ctx.lineWidth = 1.5
        ctx.setLineDash([5, 3])
        ctx.fillRect(m.x, m.y, m.w, m.h)
        ctx.strokeRect(m.x + 0.5, m.y + 0.5, m.w - 1, m.h - 1)
        ctx.restore()
      }
      ctx.restore()

      if (deps.canAdjust.value) drawHandles(ctx, deps.sel.value, accent)
    }
  }

  watch(
    [
      deps.sel,
      deps.strokes,
      deps.draft,
      deps.hoverWin,
      deps.phase,
      deps.selectedIdx,
      deps.annotMarquee,
      deps.bgImg
    ],
    () => paint()
  )

  return { overlayCanvas, paint }
}
