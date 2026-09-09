import type { ShotOverlayInit } from '@shared/types'
import { computed, onUnmounted, ref, watch, type Ref } from 'vue'
import { DOCK_MARGIN, placeDock, type SelRect } from '../tools'

/**
 * 截屏工具条：自动落位 + 拖拽手柄挪位
 */
export function useShotDock(deps: {
  sel: Ref<SelRect | null>
  init: Ref<ShotOverlayInit | null>
  vp: Ref<{ x: number; y: number }>
  showSubbar: Ref<boolean>
}) {
  const dockManual = ref<{ left: number; top: number } | null>(null)
  const dockRef = ref<HTMLElement | null>(null)
  const dockDragging = ref(false)
  const dockSize = ref({ w: 420, h: 44 })
  let dockRo: ResizeObserver | null = null
  let dockDrag: {
    pointerId: number
    ox: number
    oy: number
    baseL: number
    baseT: number
  } | null = null

  function reset(): void {
    dockManual.value = null
    dockDragging.value = false
    dockDrag = null
  }

  function measureDock(): { w: number; h: number } {
    if (dockSize.value.w > 0 && dockSize.value.h > 0) return dockSize.value
    const sub = deps.showSubbar.value ? 46 + 6 : 0
    return { w: 420, h: 44 + sub }
  }

  const toolbarStyle = computed(() => {
    if (!deps.sel.value || !deps.init.value) return { display: 'none' }
    if (dockManual.value) {
      return { top: `${dockManual.value.top}px`, left: `${dockManual.value.left}px` }
    }
    const pos = placeDock(
      deps.sel.value,
      deps.vp.value,
      deps.init.value.workArea,
      measureDock()
    )
    return { top: `${pos.top}px`, left: `${pos.left}px` }
  })

  watch(dockRef, (el) => {
    dockRo?.disconnect()
    dockRo = null
    if (!el || typeof ResizeObserver === 'undefined') return
    const apply = (): void => {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) dockSize.value = { w: r.width, h: r.height }
    }
    apply()
    dockRo = new ResizeObserver(apply)
    dockRo.observe(el)
  })

  onUnmounted(() => {
    dockRo?.disconnect()
    dockRo = null
  })

  /** 仅拖拽手柄可挪动工具条 */
  function isDockDragHandle(t: EventTarget | null): boolean {
    if (!(t instanceof Element)) return false
    return !!t.closest('[data-dock-drag]')
  }

  function onDockPointerDown(e: PointerEvent): void {
    e.stopPropagation()
    if (e.button !== 0 || !isDockDragHandle(e.target)) return
    const el = dockRef.value
    if (!el) return
    const r = el.getBoundingClientRect()
    dockDrag = {
      pointerId: e.pointerId,
      ox: e.clientX,
      oy: e.clientY,
      baseL: r.left,
      baseT: r.top
    }
    dockDragging.value = true
    el.setPointerCapture(e.pointerId)
  }

  function onDockPointerMove(e: PointerEvent): void {
    if (!dockDrag || e.pointerId !== dockDrag.pointerId) return
    const W = deps.init.value?.workArea.width ?? window.innerWidth
    const H = deps.init.value?.workArea.height ?? window.innerHeight
    const { w, h } = measureDock()
    const left = Math.max(
      DOCK_MARGIN,
      Math.min(dockDrag.baseL + (e.clientX - dockDrag.ox), W - w - DOCK_MARGIN)
    )
    const top = Math.max(
      DOCK_MARGIN,
      Math.min(dockDrag.baseT + (e.clientY - dockDrag.oy), H - h - DOCK_MARGIN)
    )
    dockManual.value = { left, top }
  }

  function onDockPointerUp(e: PointerEvent): void {
    if (!dockDrag || e.pointerId !== dockDrag.pointerId) return
    dockDrag = null
    dockDragging.value = false
  }

  return {
    dockRef,
    dockManual,
    dockDragging,
    toolbarStyle,
    reset,
    onDockPointerDown,
    onDockPointerMove,
    onDockPointerUp
  }
}
