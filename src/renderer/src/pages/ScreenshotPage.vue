<script setup lang="ts">
import type { ShotWindowInfo } from '@shared/types'
import { onMounted, onUnmounted, ref } from 'vue'
import {
  ArrowUpRight,
  BoxSelect,
  Check,
  GripVertical,
  Highlighter,
  Download,
  Redo2,
  Square,
  Trash2,
  Undo2,
  Pencil,
  X
} from 'lucide-vue-next'
import {
  cloneStroke,
  hitTopStroke,
  scaleStroke,
  strokeGeomBounds,
  strokesInMarquee,
  translateStroke
} from '@renderer/modules/screenshot/annotGeom'
import { useAnnotEditor } from '@renderer/modules/screenshot/composables/useAnnotEditor'
import { useShotDock } from '@renderer/modules/screenshot/composables/useShotDock'
import { useShotPaint } from '@renderer/modules/screenshot/composables/useShotPaint'
import { useShotSession } from '@renderer/modules/screenshot/composables/useShotSession'
import { exportSelectionPng, normalizeMosaicStroke } from '@renderer/modules/screenshot/draw'
import {
  clampMove,
  clampSel,
  HANDLE_CURSOR,
  hitHandle,
  insideSel,
  resizeBoundsLocal,
  resizeByHandle
} from '@renderer/modules/screenshot/selGeom'
import {
  ANNOT_COLORS,
  MOSAIC_MAX,
  MOSAIC_MIN,
  STROKE_MAX,
  STROKE_MIN,
  hitWindow,
  normalizeRect,
  type AnnotStroke,
  type SelRect
} from '@renderer/modules/screenshot/tools'

const DRAG_THRESHOLD = 5

const hoverWin = ref<ShotWindowInfo['bounds'] | null>(null)
const draft = ref<SelRect | null>(null)
const sel = ref<SelRect | null>(null)
const shotCursor = ref('crosshair')

const annot = useAnnotEditor(sel)
const {
  tool,
  color,
  strokeW,
  mosaicSize,
  colorOpen,
  strokes,
  past,
  future,
  selectedIdx,
  annotMarquee,
  canAdjust,
  needsColor,
  needsStroke,
  showSubbar,
  pushHistory,
  clearAnnotState,
  createStroke,
  extendStroke,
  undo,
  redo,
  deleteSelected,
  selectTool,
  pickColor,
  toggleColorPanel,
  onStrokeInput,
  onMosaicInput,
  dropLastHistory
} = annot

type DragMode =
  | { type: 'none' }
  | { type: 'region'; x0: number; y0: number }
  | { type: 'move'; ox: number; oy: number; base: SelRect }
  | { type: 'resize'; handle: string; base: SelRect; sx: number; sy: number }
  | { type: 'draw'; stroke: AnnotStroke }
  | {
      type: 'annot-move'
      indices: number[]
      ox: number
      oy: number
      bases: AnnotStroke[]
      moved: boolean
    }
  | {
      type: 'annot-resize'
      index: number
      handle: string
      baseStroke: AnnotStroke
      baseBounds: SelRect
      moved: boolean
    }
  | { type: 'annot-marquee'; x0: number; y0: number }

let drag: DragMode = { type: 'none' }
let pointerDown: { x: number; y: number } | null = null

let paintFn: () => void = () => {}
let resetDock: () => void = () => {}

const { init, phase, bgImg, vp, stageStyle } = useShotSession({
  onReset: () => {
    sel.value = null
    draft.value = null
    hoverWin.value = null
    shotCursor.value = 'crosshair'
    annot.reset()
    resetDock()
  },
  onBgReady: () => paintFn()
})

const shotPaint = useShotPaint({
  init,
  phase,
  sel,
  draft,
  hoverWin,
  strokes,
  selectedIdx,
  annotMarquee,
  canAdjust,
  bgImg
})
paintFn = shotPaint.paint

const dock = useShotDock({ sel, init, vp, showSubbar })
resetDock = () => dock.reset()
const {
  dockManual,
  dockDragging,
  toolbarStyle,
  onDockPointerDown,
  onDockPointerMove,
  onDockPointerUp
} = dock

/** 模板 ref → composable 内的元素引用 */
function bindOverlayCanvas(el: unknown): void {
  shotPaint.overlayCanvas.value = el instanceof HTMLCanvasElement ? el : null
}
function bindDockEl(el: unknown): void {
  dock.dockRef.value = el instanceof HTMLElement ? el : null
}

function boundsSize(): { w: number; h: number } {
  return {
    w: init.value?.bounds.width ?? window.innerWidth,
    h: init.value?.bounds.height ?? window.innerHeight
  }
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    void window.api.screenshot.cancel()
    return
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    if (e.shiftKey) redo()
    else undo()
    return
  }
  // 选中标注后 Backspace / Delete 删除
  if (
    phase.value === 'edit' &&
    (e.key === 'Backspace' || e.key === 'Delete') &&
    selectedIdx.value.length
  ) {
    e.preventDefault()
    deleteSelected()
    return
  }
  if (phase.value === 'edit' && e.key === 'Enter') {
    e.preventDefault()
    void finish()
  }
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))

function localPos(e: PointerEvent | MouseEvent): { x: number; y: number } {
  const o = vp.value
  return { x: e.clientX + o.x, y: e.clientY + o.y }
}

function onPointerMove(e: PointerEvent): void {
  const { x, y } = localPos(e)
  if (phase.value === 'select' && drag.type === 'none' && !pointerDown) {
    hoverWin.value = init.value ? hitWindow(init.value.windows, x, y) : null
  }

  if (pointerDown && drag.type === 'none') {
    const dx = x - pointerDown.x
    const dy = y - pointerDown.y
    if (Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
      drag = { type: 'region', x0: pointerDown.x, y0: pointerDown.y }
      hoverWin.value = null
    }
  }

  const { w: bw, h: bh } = boundsSize()
  if (drag.type === 'region') {
    draft.value = normalizeRect(drag.x0, drag.y0, x, y)
  } else if (drag.type === 'move' && canAdjust.value) {
    sel.value = clampMove(drag.base, x - drag.ox, y - drag.oy, bw, bh)
  } else if (drag.type === 'resize' && canAdjust.value && sel.value) {
    sel.value = resizeByHandle(drag.base, drag.handle, x, y, bw, bh)
  } else if (drag.type === 'draw') {
    extendStroke(drag.stroke, x, y)
    paintFn()
  } else if (drag.type === 'annot-move' && sel.value) {
    const lx = x - sel.value.x
    const ly = y - sel.value.y
    const dx = lx - drag.ox
    const dy = ly - drag.oy
    if (Math.hypot(dx, dy) >= 1) drag.moved = true
    const next = strokes.value.slice()
    for (let i = 0; i < drag.indices.length; i++) {
      const idx = drag.indices[i]!
      next[idx] = translateStroke(drag.bases[i]!, dx, dy)
    }
    strokes.value = next
  } else if (drag.type === 'annot-resize' && sel.value) {
    const lx = x - sel.value.x
    const ly = y - sel.value.y
    const nb = resizeBoundsLocal(drag.baseBounds, drag.handle, lx, ly)
    if (
      Math.abs(nb.x - drag.baseBounds.x) >= 1 ||
      Math.abs(nb.y - drag.baseBounds.y) >= 1 ||
      Math.abs(nb.w - drag.baseBounds.w) >= 1 ||
      Math.abs(nb.h - drag.baseBounds.h) >= 1
    ) {
      drag.moved = true
    }
    const next = strokes.value.slice()
    next[drag.index] = scaleStroke(drag.baseStroke, drag.baseBounds, nb)
    strokes.value = next
  } else if (drag.type === 'annot-marquee' && sel.value) {
    const lx = x - sel.value.x
    const ly = y - sel.value.y
    annotMarquee.value = normalizeRect(drag.x0, drag.y0, lx, ly)
  }

  updateCursor(x, y)
}

function onPointerDown(e: PointerEvent): void {
  if (colorOpen.value) colorOpen.value = false
  if (e.button === 2) {
    e.preventDefault()
    void window.api.screenshot.cancel()
    return
  }
  if (e.button !== 0) return
  const { x, y } = localPos(e)
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

  if (phase.value === 'select') {
    pointerDown = { x, y }
    drag = { type: 'none' }
    return
  }

  if (!sel.value) return

  const handle = canAdjust.value ? hitHandle(sel.value, x, y) : null
  if (handle) {
    drag = { type: 'resize', handle, base: { ...sel.value }, sx: x, sy: y }
    updateCursor(x, y)
    return
  }

  if (!insideSel(sel.value, x, y)) return

  if (canAdjust.value && !tool.value) {
    drag = { type: 'move', ox: x, oy: y, base: { ...sel.value } }
    updateCursor(x, y)
    return
  }

  const lx = x - sel.value.x
  const ly = y - sel.value.y

  if (tryBeginAnnotResize(lx, ly)) {
    updateCursor(x, y)
    return
  }
  if (tryBeginAnnotMove(lx, ly)) {
    updateCursor(x, y)
    return
  }
  if (!tool.value) return

  if (tool.value === 'select') {
    selectedIdx.value = []
    annotMarquee.value = { x: lx, y: ly, w: 0, h: 0 }
    drag = { type: 'annot-marquee', x0: lx, y0: ly }
    updateCursor(x, y)
    return
  }

  selectedIdx.value = []
  const stroke = createStroke(tool.value, lx, ly)
  if (!stroke) return
  pushHistory()
  strokes.value = [...strokes.value, stroke]
  drag = { type: 'draw', stroke }
  updateCursor(x, y)
}

function tryBeginAnnotResize(lx: number, ly: number): boolean {
  if (selectedIdx.value.length !== 1) return false
  const index = selectedIdx.value[0]!
  const s = strokes.value[index]
  if (!s) return false
  const bounds = strokeGeomBounds(s)
  const handle = hitHandle(bounds, lx, ly)
  if (!handle) return false
  pushHistory()
  drag = {
    type: 'annot-resize',
    index,
    handle,
    baseStroke: cloneStroke(s),
    baseBounds: { ...bounds },
    moved: false
  }
  return true
}

function tryBeginAnnotMove(lx: number, ly: number): boolean {
  if (!strokes.value.length) return false
  const hit = hitTopStroke(strokes.value, lx, ly)
  if (hit < 0) return false
  if (!selectedIdx.value.includes(hit)) selectedIdx.value = [hit]
  const indices = [...selectedIdx.value]
  pushHistory()
  drag = {
    type: 'annot-move',
    indices,
    ox: lx,
    oy: ly,
    bases: indices.map((i) => cloneStroke(strokes.value[i]!)),
    moved: false
  }
  return true
}

function onPointerUp(e: PointerEvent): void {
  const { x, y } = localPos(e)
  const { w: bw, h: bh } = boundsSize()

  if (phase.value === 'select') {
    if (drag.type === 'region' && draft.value && draft.value.w >= 2 && draft.value.h >= 2) {
      sel.value = clampSel(draft.value, bw, bh)
      draft.value = null
      phase.value = 'edit'
      tool.value = null
      colorOpen.value = false
      dockManual.value = null
    } else if (pointerDown && Math.hypot(x - pointerDown.x, y - pointerDown.y) < DRAG_THRESHOLD) {
      const hit = init.value ? hitWindow(init.value.windows, pointerDown.x, pointerDown.y) : null
      if (hit) {
        sel.value = clampSel({ x: hit.x, y: hit.y, w: hit.width, h: hit.height }, bw, bh)
        phase.value = 'edit'
        tool.value = null
        colorOpen.value = false
        dockManual.value = null
      }
    }
    pointerDown = null
    drag = { type: 'none' }
    draft.value = null
    updateCursor(x, y)
    return
  }

  if (
    (drag.type === 'move' || drag.type === 'resize') &&
    sel.value &&
    (sel.value.x !== drag.base.x ||
      sel.value.y !== drag.base.y ||
      sel.value.w !== drag.base.w ||
      sel.value.h !== drag.base.h)
  ) {
    clearAnnotState()
  }

  if (drag.type === 'annot-move' || drag.type === 'annot-resize') {
    if (!drag.moved) dropLastHistory()
    else if (drag.type === 'annot-resize') {
      const s = strokes.value[drag.index]
      if (s?.kind === 'mosaic') normalizeMosaicStroke(s)
    }
  } else if (drag.type === 'draw' && drag.stroke.kind === 'mosaic') {
    if (Math.abs(drag.stroke.w) < 2 || Math.abs(drag.stroke.h) < 2) {
      strokes.value = strokes.value.slice(0, -1)
      past.value = past.value.slice(0, -1)
    } else {
      normalizeMosaicStroke(drag.stroke)
    }
  } else if (drag.type === 'annot-marquee' && annotMarquee.value) {
    const box = annotMarquee.value
    selectedIdx.value = box.w >= 3 && box.h >= 3 ? strokesInMarquee(strokes.value, box) : []
    annotMarquee.value = null
  }

  drag = { type: 'none' }
  pointerDown = null
  updateCursor(x, y)
  paintFn()
}

function updateCursor(x: number, y: number): void {
  if (drag.type === 'resize' || drag.type === 'annot-resize') {
    shotCursor.value = HANDLE_CURSOR[drag.handle] ?? 'default'
    return
  }
  if (drag.type === 'move' || drag.type === 'annot-move') {
    shotCursor.value = 'move'
    return
  }
  if (drag.type === 'annot-marquee') {
    shotCursor.value = 'crosshair'
    return
  }
  if (drag.type === 'region' || drag.type === 'draw' || phase.value === 'select') {
    shotCursor.value = 'crosshair'
    return
  }
  if (phase.value === 'edit' && sel.value) {
    if (canAdjust.value) {
      const h = hitHandle(sel.value, x, y)
      if (h) {
        shotCursor.value = HANDLE_CURSOR[h] ?? 'default'
        return
      }
      if (insideSel(sel.value, x, y) && !tool.value) {
        shotCursor.value = 'move'
        return
      }
    }
    if (insideSel(sel.value, x, y)) {
      const lx = x - sel.value.x
      const ly = y - sel.value.y
      if (selectedIdx.value.length === 1) {
        const s = strokes.value[selectedIdx.value[0]!]
        if (s) {
          const ah = hitHandle(strokeGeomBounds(s), lx, ly)
          if (ah) {
            shotCursor.value = HANDLE_CURSOR[ah] ?? 'default'
            return
          }
        }
      }
      if (hitTopStroke(strokes.value, lx, ly) >= 0) {
        shotCursor.value = 'move'
        return
      }
      shotCursor.value = 'crosshair'
      return
    }
  }
  shotCursor.value = 'default'
}

function onDblClick(e: MouseEvent): void {
  if (phase.value !== 'edit' || !sel.value) return
  const { x, y } = localPos(e)
  if (insideSel(sel.value, x, y)) void finish()
}

async function finish(): Promise<void> {
  if (!sel.value || !bgImg.value || !init.value) return
  const b64 = await exportSelectionPng(
    bgImg.value,
    sel.value,
    strokes.value,
    init.value.scaleFactor
  )
  if (b64) await window.api.screenshot.complete(b64)
}

async function save(): Promise<void> {
  if (!sel.value || !bgImg.value || !init.value) return
  const b64 = await exportSelectionPng(
    bgImg.value,
    sel.value,
    strokes.value,
    init.value.scaleFactor
  )
  if (b64) await window.api.screenshot.save(b64)
}

function cancelShot(): void {
  void window.api.screenshot.cancel()
}
</script>

<template>
  <div
    class="shot"
    :style="{ cursor: dockDragging ? 'grabbing' : shotCursor }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @dblclick="onDblClick"
    @contextmenu.prevent
  >
    <div class="shot-stage" :style="stageStyle">
      <img v-if="init" class="shot-bg" :src="init.imageUrl" alt="" draggable="false" />
      <canvas :ref="bindOverlayCanvas" class="shot-canvas" />
    </div>

    <div
      v-if="phase === 'edit' && sel"
      :ref="bindDockEl"
      class="shot-dock"
      :class="{ dragging: dockDragging }"
      :style="toolbarStyle"
      @pointerdown="onDockPointerDown"
      @pointermove="onDockPointerMove"
      @pointerup="onDockPointerUp"
      @pointercancel="onDockPointerUp"
    >
      <div class="shot-toolbar" role="toolbar" aria-label="截屏标注工具">
        <button
          type="button"
          class="shot-drag-handle"
          data-dock-drag
          aria-label="拖动工具条"
          title="拖动"
        >
          <GripVertical class="ico" aria-hidden="true" />
        </button>
        <span class="sep" aria-hidden="true" />
        <div class="shot-group" role="group" aria-label="画笔工具">
          <button
            type="button"
            :class="{ on: tool === 'select' }"
            aria-label="选择"
            :aria-pressed="tool === 'select'"
            title="选择 / 框选移动"
            @click="selectTool('select')"
          >
            <BoxSelect class="ico" aria-hidden="true" />
          </button>
          <button
            type="button"
            :class="{ on: tool === 'pen' }"
            aria-label="笔"
            :aria-pressed="tool === 'pen'"
            title="笔"
            @click="selectTool('pen')"
          >
            <Pencil class="ico" aria-hidden="true" />
          </button>
          <button
            type="button"
            :class="{ on: tool === 'rect' }"
            aria-label="矩形"
            :aria-pressed="tool === 'rect'"
            title="矩形"
            @click="selectTool('rect')"
          >
            <Square class="ico" aria-hidden="true" />
          </button>
          <button
            type="button"
            :class="{ on: tool === 'arrow' }"
            aria-label="箭头"
            :aria-pressed="tool === 'arrow'"
            title="箭头"
            @click="selectTool('arrow')"
          >
            <ArrowUpRight class="ico" aria-hidden="true" />
          </button>
          <button
            type="button"
            :class="{ on: tool === 'mosaic' }"
            aria-label="马赛克"
            :aria-pressed="tool === 'mosaic'"
            title="马赛克（框选）"
            @click="selectTool('mosaic')"
          >
            <Highlighter class="ico" aria-hidden="true" />
          </button>
        </div>

        <span class="sep" aria-hidden="true" />

        <div class="shot-group" role="group" aria-label="操作">
          <button
            type="button"
            aria-label="删除"
            title="删除"
            :disabled="!selectedIdx.length"
            @click="deleteSelected"
          >
            <Trash2 class="ico" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="撤销"
            title="撤销"
            :disabled="!past.length"
            @click="undo"
          >
            <Undo2 class="ico" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="重做"
            title="重做"
            :disabled="!future.length"
            @click="redo"
          >
            <Redo2 class="ico" aria-hidden="true" />
          </button>
          <button type="button" aria-label="下载" title="下载" @click.stop="save">
            <Download class="ico" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="cancel"
            aria-label="取消"
            title="取消"
            @click.stop="cancelShot"
          >
            <X class="ico" aria-hidden="true" />
          </button>
          <button type="button" class="ok" aria-label="完成" title="完成" @click.stop="finish">
            <Check class="ico" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div v-if="showSubbar" class="shot-subbar" role="toolbar" aria-label="工具选项">
        <template v-if="needsStroke">
          <span class="sub-label">粗细</span>
          <span class="sub-preview" aria-hidden="true">
            <span
              class="sub-preview-dot"
              :style="{ width: `${strokeW}px`, height: `${strokeW}px`, background: color }"
            />
          </span>
          <input
            class="sub-range"
            type="range"
            :min="STROKE_MIN"
            :max="STROKE_MAX"
            :value="strokeW"
            :aria-valuemin="STROKE_MIN"
            :aria-valuemax="STROKE_MAX"
            :aria-valuenow="strokeW"
            aria-label="粗细"
            @input="onStrokeInput"
          />
          <span class="sub-value">{{ strokeW }}</span>
        </template>

        <template v-else-if="tool === 'mosaic'">
          <span class="sub-label">粒度</span>
          <span class="sub-preview" aria-hidden="true">
            <span
              class="sub-preview-dot"
              :style="{
                width: `${mosaicSize}px`,
                height: `${mosaicSize}px`,
                background: 'var(--muted-foreground)'
              }"
            />
          </span>
          <input
            class="sub-range"
            type="range"
            :min="MOSAIC_MIN"
            :max="MOSAIC_MAX"
            :value="mosaicSize"
            :aria-valuemin="MOSAIC_MIN"
            :aria-valuemax="MOSAIC_MAX"
            :aria-valuenow="mosaicSize"
            aria-label="马赛克粒度"
            @input="onMosaicInput"
          />
          <span class="sub-value">{{ mosaicSize }}</span>
        </template>

        <template v-if="needsColor">
          <span class="sep" aria-hidden="true" />
          <div class="shot-pop-wrap">
            <button
              type="button"
              class="swatch-square"
              :style="{ background: color }"
              aria-label="选择颜色"
              title="颜色"
              :aria-expanded="colorOpen"
              aria-haspopup="true"
              @click.stop="toggleColorPanel"
            />
            <div
              v-if="colorOpen"
              class="shot-color-pop"
              role="dialog"
              aria-label="颜色"
              @pointerdown.stop
            >
              <button
                v-for="c in ANNOT_COLORS"
                :key="c"
                type="button"
                class="swatch"
                :style="{ background: c }"
                :class="{ on: color === c }"
                :aria-label="`颜色 ${c}`"
                :aria-pressed="color === c"
                @click="pickColor(c)"
              />
            </div>
          </div>
        </template>
      </div>
    </div>

    <p v-if="init && !init.windowPickAvailable && phase === 'select'" class="shot-hint">
      无法点选窗口，请拖拽框选
    </p>
  </div>
</template>

<style scoped>
.shot {
  position: fixed;
  inset: 0;
  overflow: hidden;
  user-select: none;
  background: #000;
  font-family: var(--font-sans, inherit);
}
.shot-stage {
  position: absolute;
  left: 0;
  top: 0;
  will-change: transform;
}
.shot-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
  pointer-events: none;
  image-rendering: auto;
}
.shot-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.shot-hint {
  position: absolute;
  bottom: 28px;
  left: 50%;
  z-index: 5;
  transform: translateX(-50%);
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid color-mix(in oklab, var(--border) 55%, transparent);
  background: color-mix(in oklab, var(--card) 88%, transparent);
  color: var(--foreground);
  font-size: 12px;
  font-weight: 500;
  backdrop-filter: blur(12px);
  box-shadow: 0 10px 28px -12px color-mix(in oklab, var(--foreground) 28%, transparent);
  pointer-events: none;
}
.shot-dock {
  position: absolute;
  z-index: 6;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  touch-action: none;
}
.shot-dock :is(button, input, a) {
  cursor: pointer;
}
.shot-dock .shot-drag-handle {
  width: 18px;
  cursor: grab;
  color: var(--muted-foreground);
}
.shot-dock .shot-drag-handle:hover:not(:disabled) {
  color: var(--muted-foreground);
  background: transparent;
}
.shot-dock.dragging,
.shot-dock.dragging * {
  cursor: grabbing !important;
}
.shot-toolbar,
.shot-subbar {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: center;
  padding: 4px 6px;
  border-radius: 8px;
  border: 1px solid color-mix(in oklab, var(--border) 70%, transparent);
  background: color-mix(in oklab, var(--card) 92%, transparent);
  color: var(--foreground);
  box-shadow: 0 18px 48px -16px color-mix(in oklab, var(--foreground) 28%, transparent);
  backdrop-filter: blur(18px);
}
.shot-toolbar {
  max-width: min(560px, 96vw);
}
.shot-subbar {
  min-height: 30px;
  padding: 4px 10px;
}
.shot-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.sub-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--muted-foreground);
  white-space: nowrap;
}
.sub-preview {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 21px;
  height: 21px;
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 12%);
  background: color-mix(in oklab, var(--muted-foreground) 8%, transparent);
}
.sub-preview-dot {
  display: block;
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 12%);
}
.sub-range {
  width: 120px;
  height: 4px;
  cursor: pointer;
  appearance: none;
  background: transparent;
}
.sub-range::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--muted-foreground) 35%, transparent);
}
.sub-range::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 14px;
  margin-top: -5px;
  border-radius: 999px;
  border: 2px solid var(--card);
  background: var(--primary);
  box-shadow: 0 1px 3px rgb(0 0 0 / 20%);
  cursor: pointer;
}
.sub-range::-moz-range-track {
  height: 4px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--muted-foreground) 35%, transparent);
}
.sub-range::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  border: 2px solid var(--card);
  background: var(--primary);
  box-shadow: 0 1px 3px rgb(0 0 0 / 20%);
  cursor: pointer;
}
.sub-value {
  min-width: 1.5em;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--foreground);
}
.shot-pop-wrap {
  position: relative;
  display: inline-flex;
}
.shot-color-pop {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 10px);
  z-index: 8;
  display: grid;
  grid-template-columns: repeat(4, 22px);
  gap: 8px;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid color-mix(in oklab, var(--border) 70%, transparent);
  background: color-mix(in oklab, var(--card) 96%, transparent);
  box-shadow: 0 14px 36px -14px color-mix(in oklab, var(--foreground) 30%, transparent);
  backdrop-filter: blur(16px);
  transform: translateX(-50%);
}
.shot-toolbar button,
.shot-subbar button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted-foreground);
  cursor: pointer;
  transition:
    color 0.2s ease,
    background 0.2s ease,
    box-shadow 0.2s ease,
    opacity 0.2s ease;
}
.shot-toolbar button:hover:not(:disabled),
.shot-subbar button:hover:not(:disabled) {
  color: var(--foreground);
  background: color-mix(in oklab, var(--foreground) 8%, transparent);
}
.shot-toolbar button:focus-visible,
.shot-subbar button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring) 45%, transparent);
}
.shot-toolbar button.on,
.shot-subbar button.on {
  background: color-mix(in oklab, var(--primary) 18%, transparent);
  color: var(--primary);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--primary) 35%, transparent);
}
.shot-toolbar button.ok {
  background: transparent;
  color: #22c55e;
  box-shadow: none;
}
.shot-toolbar button.ok:hover:not(:disabled) {
  color: #16a34a;
  background: color-mix(in oklab, #22c55e 14%, transparent);
}
.shot-toolbar button.cancel:hover:not(:disabled) {
  color: var(--destructive);
  background: color-mix(in oklab, var(--destructive) 12%, transparent);
}
.shot-toolbar button:disabled {
  opacity: 0.35;
  cursor: default;
}
.ico {
  width: 15px;
  height: 15px;
}
.sep {
  width: 1px;
  height: 18px;
  flex-shrink: 0;
  background: color-mix(in oklab, var(--border) 80%, transparent);
}
.swatch {
  width: 18px !important;
  height: 18px !important;
  border-radius: 999px !important;
  border: 1px solid color-mix(in oklab, var(--border) 70%, transparent) !important;
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 8%);
}
.swatch-square {
  width: 22px !important;
  height: 22px !important;
  border-radius: 5px !important;
  border: 1px solid color-mix(in oklab, var(--border) 70%, transparent) !important;
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 10%);
}
.swatch.on {
  box-shadow:
    0 0 0 2px color-mix(in oklab, var(--card) 90%, transparent),
    0 0 0 3.5px var(--primary);
}
.shot-color-pop .swatch {
  width: 22px !important;
  height: 22px !important;
}
.wbtn {
  width: auto !important;
  min-width: 30px;
  padding: 0 5px;
  font-size: 11px;
  font-weight: 500;
}
.wbtn.chip {
  min-width: 26px;
  border-radius: 999px !important;
  font-variant-numeric: tabular-nums;
}

@media (prefers-reduced-motion: reduce) {
  .shot-toolbar button,
  .shot-subbar button {
    transition: none;
  }
}
</style>
