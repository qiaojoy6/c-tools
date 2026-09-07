import { computed, ref, type Ref } from 'vue'
import { cloneStrokes } from '../annotGeom'
import {
  ANNOT_COLORS,
  MOSAIC_DEFAULT,
  MOSAIC_MAX,
  MOSAIC_MIN,
  STROKE_DEFAULT,
  STROKE_MAX,
  STROKE_MIN,
  type AnnotStroke,
  type AnnotTool,
  type SelRect
} from '../tools'

/**
 * 截屏标注：工具、笔画栈与撤销/重做
 */
export function useAnnotEditor(sel: Ref<SelRect | null>) {
  const tool = ref<AnnotTool | null>(null)
  const color = ref<string>(ANNOT_COLORS[0])
  const strokeW = ref(STROKE_DEFAULT)
  const mosaicSize = ref(MOSAIC_DEFAULT)
  const colorOpen = ref(false)

  const strokes = ref<AnnotStroke[]>([])
  const past = ref<AnnotStroke[][]>([])
  const future = ref<AnnotStroke[][]>([])
  const selectedIdx = ref<number[]>([])
  const annotMarquee = ref<SelRect | null>(null)

  const hasAnnot = computed(() => strokes.value.length > 0)
  const canAdjust = computed(() => !hasAnnot.value)
  const needsColor = computed(
    () => tool.value === 'pen' || tool.value === 'rect' || tool.value === 'arrow'
  )
  const needsStroke = computed(
    () => tool.value === 'pen' || tool.value === 'rect' || tool.value === 'arrow'
  )
  const showSubbar = computed(() => needsStroke.value || tool.value === 'mosaic')

  function pushHistory(): void {
    past.value = [...past.value, cloneStrokes(strokes.value)]
    future.value = []
  }

  function clearAnnotState(): void {
    strokes.value = []
    past.value = []
    future.value = []
    selectedIdx.value = []
    annotMarquee.value = null
  }

  /** 新会话：清空标注与工具 */
  function reset(): void {
    clearAnnotState()
    tool.value = null
    colorOpen.value = false
  }

  function createStroke(t: AnnotTool, x: number, y: number): AnnotStroke | null {
    if (t === 'pen') {
      return { kind: 'pen', color: color.value, width: strokeW.value, points: [{ x, y }] }
    }
    if (t === 'rect') {
      return { kind: 'rect', color: color.value, width: strokeW.value, x, y, w: 0, h: 0 }
    }
    if (t === 'arrow') {
      return { kind: 'arrow', color: color.value, width: strokeW.value, x1: x, y1: y, x2: x, y2: y }
    }
    if (t === 'mosaic') {
      return { kind: 'mosaic', size: mosaicSize.value, x, y, w: 0, h: 0, preview: true }
    }
    return null
  }

  function extendStroke(stroke: AnnotStroke, absX: number, absY: number): void {
    if (!sel.value) return
    const x = absX - sel.value.x
    const y = absY - sel.value.y
    if (stroke.kind === 'pen') {
      stroke.points.push({ x, y })
    } else if (stroke.kind === 'rect' || stroke.kind === 'mosaic') {
      stroke.w = x - stroke.x
      stroke.h = y - stroke.y
    } else if (stroke.kind === 'arrow') {
      stroke.x2 = x
      stroke.y2 = y
    }
  }

  function undo(): void {
    const prev = past.value[past.value.length - 1]
    if (!prev) return
    past.value = past.value.slice(0, -1)
    future.value = [...future.value, cloneStrokes(strokes.value)]
    strokes.value = prev
    selectedIdx.value = []
    annotMarquee.value = null
    if (strokes.value.length === 0) {
      tool.value = null
      colorOpen.value = false
    }
  }

  function redo(): void {
    const next = future.value[future.value.length - 1]
    if (!next) return
    future.value = future.value.slice(0, -1)
    past.value = [...past.value, cloneStrokes(strokes.value)]
    strokes.value = next
    selectedIdx.value = []
    annotMarquee.value = null
  }

  /** 删除当前选中的标注（可撤销） */
  function deleteSelected(): boolean {
    if (!selectedIdx.value.length) return false
    const remove = new Set(selectedIdx.value)
    pushHistory()
    strokes.value = strokes.value.filter((_, i) => !remove.has(i))
    selectedIdx.value = []
    annotMarquee.value = null
    if (strokes.value.length === 0) {
      tool.value = null
      colorOpen.value = false
    }
    return true
  }

  function selectTool(next: AnnotTool): void {
    tool.value = next
    colorOpen.value = false
    if (next !== 'select') {
      selectedIdx.value = []
      annotMarquee.value = null
    }
  }

  function pickColor(c: string): void {
    color.value = c
    colorOpen.value = false
  }

  function toggleColorPanel(): void {
    if (!needsColor.value) return
    colorOpen.value = !colorOpen.value
  }

  function onStrokeInput(e: Event): void {
    const v = Number((e.target as HTMLInputElement).value)
    if (Number.isFinite(v)) {
      strokeW.value = Math.min(STROKE_MAX, Math.max(STROKE_MIN, Math.round(v)))
    }
  }

  function onMosaicInput(e: Event): void {
    const v = Number((e.target as HTMLInputElement).value)
    if (Number.isFinite(v)) {
      mosaicSize.value = Math.min(MOSAIC_MAX, Math.max(MOSAIC_MIN, Math.round(v)))
    }
  }

  /** 未真正移动时丢掉刚压的历史 */
  function dropLastHistory(): void {
    past.value = past.value.slice(0, -1)
  }

  return {
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
    hasAnnot,
    canAdjust,
    needsColor,
    needsStroke,
    showSubbar,
    pushHistory,
    clearAnnotState,
    reset,
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
  }
}

export type AnnotEditor = ReturnType<typeof useAnnotEditor>
