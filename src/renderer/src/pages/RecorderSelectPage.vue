<script setup lang="ts">
import type {
  RecorderOverlayInit,
  RecorderWindowInfo
} from '@shared/types'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { SelectOption } from '@renderer/components/ui/select'
import { Button } from '@renderer/components/ui/button'
import RecorderOptionsBar from '@renderer/modules/recorder/components/RecorderOptionsBar.vue'
import {
  clampMove,
  clampSel,
  HANDLE_CURSOR,
  hitHandle,
  insideSel,
  resizeByHandle
} from '@renderer/modules/screenshot/selGeom'
import {
  DOCK_GAP,
  DOCK_MARGIN,
  hitWindow,
  normalizeRect,
  type SelRect
} from '@renderer/modules/screenshot/tools'
import { useRecorderPrefs } from '@renderer/modules/recorder/composables/useRecorderPrefs'

const DRAG_THRESHOLD = 5
const MIN_SEL = 16

/** 区域录屏固定 MP4、默认 30fps；清晰度与全屏录屏共用选项条 */
const DEFAULT_FPS = 30

const init = ref<RecorderOverlayInit | null>(null)
const sel = ref<SelRect | null>(null)
const draft = ref<SelRect | null>(null)
const hoverWin = ref<RecorderWindowInfo['bounds'] | null>(null)
const cursor = ref('crosshair')
const {
  enableMic,
  enableSystemAudio,
  quality,
  micDeviceId,
  mics,
  load: loadPrefs
} = useRecorderPrefs()
const starting = ref(false)

/** 麦克风下拉选项（主屏默认优先） */
const micOptions = computed<SelectOption[]>(() =>
  mics.value.map((d) => ({
    value: d.id,
    label: d.isPrimary ? `${d.name}（默认）` : d.name
  }))
)

const dockRef = ref<HTMLElement | null>(null)
const dockSize = ref({ w: 280, h: 48 })
let dockRo: ResizeObserver | null = null

const vp = computed(() => init.value?.viewportOffset ?? { x: 0, y: 0 })

const stageStyle = computed(() => {
  if (!init.value) return {}
  const { bounds } = init.value
  const o = vp.value
  return {
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
    transform: `translate(${-o.x}px, ${-o.y}px)`
  }
})

/** 已锁定选区 / 拖拽草稿 / 悬停应用窗 */
const active = computed(() => {
  if (draft.value) return draft.value
  if (sel.value) return sel.value
  const h = hoverWin.value
  if (h) return { x: h.x, y: h.y, w: h.width, h: h.height }
  return null
})

const sizeLabel = computed(() => {
  const r = active.value
  if (!r) return ''
  return `${Math.round(r.w)} * ${Math.round(r.h)}`
})

const showHandles = computed(() => !!sel.value && !draft.value)

const toolbarStyle = computed(() => {
  const r = sel.value
  if (!r || !init.value || draft.value) return { display: 'none' as const }
  const { w, h } = dockSize.value
  const work = init.value.workArea
  const sx = r.x - vp.value.x
  const sy = r.y - vp.value.y
  let left = sx + r.w / 2 - w / 2
  left = Math.max(DOCK_MARGIN, Math.min(left, work.width - w - DOCK_MARGIN))

  const below = sy + r.h + DOCK_GAP
  if (below + h <= work.height - DOCK_MARGIN) {
    return { top: `${below}px`, left: `${left}px` }
  }
  const above = sy - DOCK_GAP - h
  if (above >= DOCK_MARGIN) {
    return { top: `${above}px`, left: `${left}px` }
  }
  const inside = sy + r.h - h - DOCK_GAP
  return {
    top: `${Math.max(DOCK_MARGIN, Math.min(inside, work.height - h - DOCK_MARGIN))}px`,
    left: `${left}px`
  }
})

const handleList = computed(() => {
  const r = sel.value
  if (!r || draft.value) return [] as Array<{ k: string; x: number; y: number }>
  // 相对选区框：对齐 2px 边框中线（border-box 下中线内缩 1px）
  const inset = 1
  const w = r.w
  const h = r.h
  return [
    { k: 'nw', x: inset, y: inset },
    { k: 'n', x: w / 2, y: inset },
    { k: 'ne', x: w - inset, y: inset },
    { k: 'e', x: w - inset, y: h / 2 },
    { k: 'se', x: w - inset, y: h - inset },
    { k: 's', x: w / 2, y: h - inset },
    { k: 'sw', x: inset, y: h - inset },
    { k: 'w', x: inset, y: h / 2 }
  ]
})

type DragMode =
  | { type: 'none' }
  | { type: 'region'; x0: number; y0: number }
  | { type: 'move'; ox: number; oy: number; base: SelRect }
  | { type: 'resize'; handle: string; base: SelRect }

let drag: DragMode = { type: 'none' }
let pointerDown: { x: number; y: number } | null = null

function boundsWH(): { w: number; h: number } {
  return {
    w: init.value?.bounds.width ?? window.innerWidth,
    h: init.value?.bounds.height ?? window.innerHeight
  }
}

function toLocal(e: PointerEvent): { x: number; y: number } {
  return { x: e.clientX + vp.value.x, y: e.clientY + vp.value.y }
}

function resetLocal(): void {
  sel.value = null
  draft.value = null
  hoverWin.value = null
  cursor.value = 'crosshair'
  starting.value = false
  drag = { type: 'none' }
  pointerDown = null
}

function applyInit(payload: RecorderOverlayInit): void {
  init.value = payload
  resetLocal()
  void loadPrefs()
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.api.recorder.overlayReady(payload.displayId)
    })
  })
}

function updateCursor(x: number, y: number): void {
  if (drag.type !== 'none') {
    cursor.value = 'crosshair'
    return
  }
  const r = sel.value
  if (!r) {
    cursor.value = 'crosshair'
    return
  }
  const h = hitHandle(r, x, y)
  if (h) {
    cursor.value = HANDLE_CURSOR[h] ?? 'default'
    return
  }
  cursor.value = insideSel(r, x, y) ? 'move' : 'crosshair'
}

function onPointerDown(e: PointerEvent): void {
  if (e.button !== 0 || !init.value) return
  if ((e.target as Element | null)?.closest?.('.rec-dock')) return
  const { x, y } = toLocal(e)
  pointerDown = { x, y }
  const r = sel.value

  // 已有选区：缩放 / 平移；点在外侧则清空，再点选窗或框选
  if (r) {
    const handle = hitHandle(r, x, y)
    if (handle) {
      drag = { type: 'resize', handle, base: { ...r } }
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      return
    }
    if (insideSel(r, x, y)) {
      drag = { type: 'move', ox: x, oy: y, base: { ...r } }
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      return
    }
    sel.value = null
  }

  // 未锁定选区：先记下按下点，移动超阈值再变框选（与截屏一致）
  drag = { type: 'none' }
  hoverWin.value = null
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent): void {
  if (!init.value) return
  const { x, y } = toLocal(e)
  const { w, h } = boundsWH()

  // 无选区时悬停高亮应用窗
  if (!sel.value && drag.type === 'none' && !pointerDown) {
    hoverWin.value = hitWindow(init.value.windows, x, y)
  }

  // 按下后拖过阈值 → 进入框选
  if (pointerDown && drag.type === 'none' && !sel.value) {
    if (Math.hypot(x - pointerDown.x, y - pointerDown.y) >= DRAG_THRESHOLD) {
      drag = { type: 'region', x0: pointerDown.x, y0: pointerDown.y }
      hoverWin.value = null
      draft.value = clampSel(normalizeRect(pointerDown.x, pointerDown.y, x, y), w, h)
    }
    return
  }

  if (drag.type === 'region') {
    draft.value = clampSel(normalizeRect(drag.x0, drag.y0, x, y), w, h)
    return
  }
  if (drag.type === 'move') {
    sel.value = clampMove(drag.base, x - drag.ox, y - drag.oy, w, h)
    return
  }
  if (drag.type === 'resize') {
    sel.value = resizeByHandle(drag.base, drag.handle, x, y, w, h)
    return
  }
  updateCursor(x, y)
}

function onPointerUp(e: PointerEvent): void {
  if (!init.value) return
  const { x, y } = toLocal(e)
  const { w, h } = boundsWH()

  if (drag.type === 'region') {
    const d = draft.value
    draft.value = null
    if (d && d.w >= MIN_SEL && d.h >= MIN_SEL) {
      sel.value = clampSel(d, w, h)
    }
  } else if (
    !sel.value &&
    pointerDown &&
    Math.hypot(x - pointerDown.x, y - pointerDown.y) < DRAG_THRESHOLD
  ) {
    // 单击：锁定光标下应用窗整窗外接矩形
    const hit = hitWindow(init.value.windows, pointerDown.x, pointerDown.y)
    if (hit) {
      sel.value = clampSel({ x: hit.x, y: hit.y, w: hit.width, h: hit.height }, w, h)
    }
  }

  hoverWin.value = null
  drag = { type: 'none' }
  pointerDown = null
  try {
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
  } catch {
    /* ignore */
  }
  updateCursor(x, y)
}

async function onCancel(): Promise<void> {
  await window.api.recorder.cancelSelect()
}

async function onStart(): Promise<void> {
  const r = sel.value
  const root = init.value
  if (!r || !root || starting.value) return

  starting.value = true
  try {
    await window.api.recorder.confirmSelect({
      displayId: root.displayId,
      screenId: root.screenId,
      regionDip: { x: r.x, y: r.y, width: r.w, height: r.h },
      scaleFactor: root.scaleFactor,
      enableMic: enableMic.value,
      enableSystemAudio: enableSystemAudio.value,
      micDeviceId: micDeviceId.value.trim() || undefined,
      fps: DEFAULT_FPS,
      quality: quality.value
    })
  } finally {
    starting.value = false
  }
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    void onCancel()
  }
}

function onContextMenu(e: MouseEvent): void {
  e.preventDefault()
  void onCancel()
}

watch(dockRef, (el) => {
  dockRo?.disconnect()
  dockRo = null
  if (!el || typeof ResizeObserver === 'undefined') return
  const apply = (): void => {
    const box = el.getBoundingClientRect()
    if (box.width > 0 && box.height > 0) dockSize.value = { w: box.width, h: box.height }
  }
  apply()
  dockRo = new ResizeObserver(apply)
  dockRo.observe(el)
})

let offInit: (() => void) | null = null
let offWindows: (() => void) | null = null

onMounted(() => {
  offInit = window.api.recorder.onSelectInit(applyInit)
  offWindows = window.api.recorder.onSelectWindows((payload) => {
    if (!init.value) return
    init.value = {
      ...init.value,
      windows: payload.windows,
      windowPickAvailable: payload.windowPickAvailable
    }
  })
  window.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
  offInit?.()
  offWindows?.()
  window.removeEventListener('keydown', onKeyDown)
  dockRo?.disconnect()
})
</script>

<template>
  <div
    class="rec"
    :style="{ cursor }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @contextmenu="onContextMenu"
  >
    <div v-if="init" class="rec-stage" :style="stageStyle">
      <!-- 整屏遮罩；选区用巨大 box-shadow 镂空 -->
      <div
        v-if="active"
        class="rec-mask"
        :style="{
          left: `${active.x}px`,
          top: `${active.y}px`,
          width: `${active.w}px`,
          height: `${active.h}px`
        }"
      />
      <div v-else class="rec-mask-full" />

      <div
        v-if="active"
        class="rec-frame"
        :class="{ 'is-hover': !sel && !draft && !!hoverWin }"
        :style="{
          left: `${active.x}px`,
          top: `${active.y}px`,
          width: `${active.w}px`,
          height: `${active.h}px`
        }"
      >
        <div class="rec-size">{{ sizeLabel }}</div>
        <span
          v-for="h in handleList"
          v-show="showHandles"
          :key="h.k"
          class="rec-handle"
          :style="{ left: `${h.x}px`, top: `${h.y}px` }"
        />
      </div>
    </div>

    <p v-if="init && !sel && !draft" class="rec-hint">
      {{
        init.windowPickAvailable
          ? '单击应用窗口，或拖拽框选区域'
          : '拖拽框选录制区域'
      }}
    </p>

    <div
      v-if="sel && !draft"
      ref="dockRef"
      class="rec-dock"
      :style="toolbarStyle"
      @pointerdown.stop
    >
      <RecorderOptionsBar
        v-model:enable-mic="enableMic"
        v-model:enable-system-audio="enableSystemAudio"
        v-model:quality="quality"
        v-model:mic-device-id="micDeviceId"
        :mic-options="micOptions"
        :disabled="starting"
      >
        <template #actions>
          <Button type="button" variant="outline" size="sm" :disabled="starting" @click="onCancel">
            退出录制
          </Button>
          <Button
            type="button"
            size="sm"
            class="bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-600/40"
            :disabled="starting || !sel"
            @click="onStart"
          >
            {{ starting ? '启动中…' : '开始录制' }}
          </Button>
        </template>
      </RecorderOptionsBar>
    </div>
  </div>
</template>

<style scoped>
.rec {
  --frame: #5b9dff;

  position: fixed;
  inset: 0;
  overflow: hidden;
  user-select: none;
  background: transparent;
  font-family:
    'PingFang SC',
    'SF Pro Text',
    'Segoe UI',
    system-ui,
    sans-serif;
}
.rec-stage {
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: none;
}
.rec-mask-full {
  position: absolute;
  inset: 0;
  background: rgb(0 0 0 / 42%);
}
.rec-mask {
  position: absolute;
  box-shadow: 0 0 0 9999px rgb(0 0 0 / 42%);
  background: transparent;
}
.rec-frame {
  position: absolute;
  box-sizing: border-box;
  border: 2px solid var(--frame);
  pointer-events: none;
}
.rec-frame.is-hover {
  border-style: dashed;
}
.rec-hint {
  position: absolute;
  bottom: 28px;
  left: 50%;
  z-index: 5;
  transform: translateX(-50%);
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: rgb(255 255 255 / 94%);
  color: var(--foreground);
  font-size: 12px;
  font-weight: 500;
  box-shadow: 0 8px 24px -12px rgb(15 23 42 / 35%);
  pointer-events: none;
  white-space: nowrap;
}
.rec-size {
  position: absolute;
  left: 0;
  top: -28px;
  padding: 2px 8px;
  border-radius: 6px;
  background: #fff;
  color: var(--foreground);
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 20px;
  white-space: nowrap;
  box-shadow: 0 1px 4px rgb(15 23 42 / 16%);
}
.rec-handle {
  position: absolute;
  width: 10px;
  height: 10px;
  margin: 0;
  border-radius: 999px;
  border: 2px solid var(--frame);
  background: #fff;
  box-shadow: 0 1px 2px rgb(15 23 42 / 18%);
  transform: translate(-50%, -50%);
}
.rec-dock {
  position: absolute;
  z-index: 6;
  pointer-events: auto;
}
</style>
