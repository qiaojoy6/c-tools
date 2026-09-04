<script setup lang="ts">
import type { ClipRecord } from '@shared/types'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import ClipCard from '@renderer/modules/clipboard/components/ClipCard.vue'
import { useHistory } from '@renderer/modules/clipboard/composables/useHistory'
import { ClipboardList, Search, Settings2, Trash2 } from 'lucide-vue-next'

type FilterType = 'all' | 'text' | 'image'

const { records, refresh, remove, clear, paste } = useHistory()

// ---------- 状态 ----------
const search = ref('')
const searchWrap = ref<HTMLElement | null>(null)
const filter = ref<FilterType>('all')
const highlight = ref(0)
const selectedIds = ref<Set<string>>(new Set())
const showClearConfirm = ref(false)
const preview = ref<ClipRecord | null>(null)
const toastMsg = ref('')

const tabs: { label: string; value: FilterType }[] = [
  { label: '全部', value: 'all' },
  { label: '文本', value: 'text' },
  { label: '图片', value: 'image' }
]

let toastTimer: ReturnType<typeof setTimeout> | null = null
/** Shift 范围多选的锚点索引 */
let anchorIndex = -1
let offShown: (() => void) | null = null

// ---------- 过滤 ----------
const filtered = computed<ClipRecord[]>(() => {
  const keyword = search.value.trim().toLowerCase()
  return records.value.filter((r) => {
    if (filter.value !== 'all' && r.type !== filter.value) return false
    if (keyword && (r.type !== 'text' || !r.text?.toLowerCase().includes(keyword))) return false
    return true
  })
})

watch([search, filter], () => {
  highlight.value = 0
  anchorIndex = -1
})

watch(
  () => filtered.value.length,
  (len) => {
    if (highlight.value >= len) highlight.value = Math.max(0, len - 1)
  }
)

// ---------- 交互 ----------
function showToast(message: string): void {
  toastMsg.value = message
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toastMsg.value = ''), 1800)
}

function scrollActive(): void {
  nextTick(() => {
    document
      .querySelector('[data-clip-card][data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  })
}

function move(delta: number): void {
  const len = filtered.value.length
  if (len === 0) return
  highlight.value = (highlight.value + delta + len) % len
  preview.value = null
  scrollActive()
}

/** 左右键切换类型 Tab：全部 → 文本 → 图片 */
function switchFilter(delta: number): void {
  const i = tabs.findIndex((t) => t.value === filter.value)
  const next = (i + delta + tabs.length) % tabs.length
  filter.value = tabs[next]!.value
  selectedIds.value = new Set()
  preview.value = null
}

function toggleSelect(index: number): void {
  const record = filtered.value[index]
  if (!record) return
  const next = new Set(selectedIds.value)
  if (next.has(record.id)) next.delete(record.id)
  else next.add(record.id)
  selectedIds.value = next
}

function onActivate(record: ClipRecord, e: MouseEvent): void {
  const index = filtered.value.findIndex((r) => r.id === record.id)
  if (index >= 0) highlight.value = index

  // Shift：范围多选
  if (e.shiftKey) {
    if (anchorIndex < 0) anchorIndex = highlight.value
    const [from, to] = anchorIndex <= index ? [anchorIndex, index] : [index, anchorIndex]
    const next = new Set(selectedIds.value)
    for (let i = from; i <= to; i++) {
      const r = filtered.value[i]
      if (r) next.add(r.id)
    }
    selectedIds.value = next
    return
  }

  // Cmd/Ctrl：单个切换选中
  if (e.metaKey || e.ctrlKey) {
    anchorIndex = index
    toggleSelect(index)
    return
  }

  // 普通点击：仅定位高亮，双击或 Enter 才使用
  anchorIndex = index
}

/** Enter：多选批量粘贴，否则粘贴当前高亮项 */
async function pasteCurrent(): Promise<void> {
  const list = filtered.value
  if (list.length === 0) return
  const selected = list.filter((r) => selectedIds.value.has(r.id)).map((r) => r.id)
  const ids = selected.length > 0 ? selected : [list[highlight.value]!.id]
  const ok = await paste(ids)
  if (!ok) showToast('粘贴失败，请检查系统辅助权限后重试')
  selectedIds.value = new Set()
}

/** 双击：单条直接粘贴 */
async function onCommit(record: ClipRecord): Promise<void> {
  const ok = await paste([record.id])
  if (!ok) showToast('粘贴失败，请检查系统辅助权限后重试')
}

function onRemoveCard(record: ClipRecord): void {
  void remove(record.id)
  const next = new Set(selectedIds.value)
  next.delete(record.id)
  selectedIds.value = next
}

function removeCurrent(): void {
  const record = filtered.value[highlight.value]
  if (!record) return
  onRemoveCard(record)
  // 移除后列表长度为 len-1，钳制高亮位置
  highlight.value = Math.max(0, Math.min(highlight.value, filtered.value.length - 2))
}

async function confirmClear(): Promise<void> {
  showClearConfirm.value = false
  await clear()
  selectedIds.value = new Set()
  highlight.value = 0
  showToast('已清空全部记录')
}

function onPreview(record: ClipRecord | null): void {
  preview.value = record?.type === 'image' ? record : null
}

function hidePanel(): void {
  window.api.hidePanel()
}

function openSettings(): void {
  window.api.openSettings()
}

// ---------- 键盘导航 ----------
function isTypingTarget(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null
  return el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA'
}

function onKeydown(e: KeyboardEvent): void {
  if (showClearConfirm.value) return

  // 输入法组合中（如中文候选确认）：不拦截按键，让回车先确认候选并输入到搜索框
  if (e.isComposing || e.keyCode === 229) return

  if (e.key === 'Escape') {
    e.preventDefault()
    if (search.value || preview.value) {
      search.value = ''
      preview.value = null
      blurSearch()
    } else {
      hidePanel()
    }
    return
  }

  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
    e.preventDefault()
    focusSearch()
    return
  }

  // 上下/左右始终导航，不进搜索框
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      move(1)
      return
    case 'ArrowUp':
      e.preventDefault()
      move(-1)
      return
    case 'ArrowLeft':
      if (isTypingTarget(e)) return
      e.preventDefault()
      switchFilter(-1)
      return
    case 'ArrowRight':
      if (isTypingTarget(e)) return
      e.preventDefault()
      switchFilter(1)
      return
    case 'Tab':
      e.preventDefault()
      move(e.shiftKey ? -1 : 1)
      return
  }

  // 未聚焦搜索时：仅英文/数字敲键才拉起搜索并写入
  if (!isTypingTarget(e) && !e.metaKey && !e.ctrlKey && !e.altKey && /^[a-zA-Z0-9]$/.test(e.key)) {
    e.preventDefault()
    search.value += e.key
    focusSearch()
    return
  }

  switch (e.key) {
    case ' ':
      if (isTypingTarget(e)) return
      e.preventDefault()
      toggleSelect(highlight.value)
      break
    case 'Enter':
      e.preventDefault()
      void pasteCurrent()
      break
    case 'Delete':
    case 'Backspace':
      if (isTypingTarget(e)) return
      e.preventDefault()
      removeCurrent()
      break
  }
}

function focusSearch(): void {
  searchWrap.value?.querySelector('input')?.focus()
}

function blurSearch(): void {
  searchWrap.value?.querySelector('input')?.blur()
}

// ---------- 生命周期 ----------
onMounted(() => {
  offShown = window.api.onPanelShown(() => {
    search.value = ''
    filter.value = 'all'
    highlight.value = 0
    selectedIds.value = new Set()
    preview.value = null
    void refresh()
    blurSearch()
  })
  window.addEventListener('keydown', onKeydown, true)
})

onUnmounted(() => {
  offShown?.()
  window.removeEventListener('keydown', onKeydown, true)
  if (toastTimer) clearTimeout(toastTimer)
})
</script>

<template>
  <div class="flex h-screen flex-col overflow-hidden">
    <!-- 顶栏：搜索 + 类型过滤 -->
    <header
      class="drag-region flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2.5"
    >
      <div ref="searchWrap" class="relative min-w-0 flex-1">
        <Search
          class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          v-model="search"
          placeholder="搜索剪贴记录…"
          class="no-drag h-10 rounded-lg bg-card/50 pl-9"
        />
      </div>
      <div class="no-drag flex shrink-0 items-center gap-0.5 rounded-lg bg-card/50 p-0.5">
        <button
          v-for="tab in tabs"
          :key="tab.value"
          class="cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors"
          :class="filter === tab.value ? 'bg-primary/15 text-primary' : 'hover:text-foreground'"
          @click="filter = tab.value"
        >
          {{ tab.label }}
        </button>
      </div>
    </header>

    <!-- 记录列表 -->
    <main class="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
      <template v-if="filtered.length > 0">
        <ClipCard
          v-for="(record, index) in filtered"
          :key="record.id"
          :record="record"
          :active="index === highlight"
          :selected="selectedIds.has(record.id)"
          @activate="onActivate"
          @commit="onCommit"
          @remove="onRemoveCard"
          @preview="onPreview"
        />
      </template>
      <div
        v-else
        class="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground"
      >
        <ClipboardList class="size-10 opacity-30" />
        <p class="text-sm">
          {{ search || filter !== 'all' ? '没有匹配的记录' : '暂无剪贴记录，去复制点什么吧' }}
        </p>
      </div>
    </main>

    <!-- 底栏：统计 + 操作 -->
    <footer
      class="flex shrink-0 items-center gap-3 border-t border-border/50 px-3 py-2 text-xs text-muted-foreground"
    >
      <span>
        共 {{ filtered.length }} 条
        <template v-if="selectedIds.size > 0"> · 已选 {{ selectedIds.size }} 条</template>
      </span>
      <span class="ml-auto hidden opacity-70 md:block"
        >双击/↵ 粘贴 · ←/→ 筛选 · 空格 多选 · ⌫ 删除</span
      >
      <div class="no-drag flex shrink-0 items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon-sm"
          title="清空全部"
          class="hover:bg-destructive/10 hover:text-destructive"
          @click="showClearConfirm = true"
        >
          <Trash2 class="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" title="设置" @click="openSettings">
          <Settings2 class="size-4" />
        </Button>
      </div>
    </footer>

    <!-- 图片悬停预览 -->
    <div
      v-if="preview?.image"
      class="pointer-events-none fixed inset-0 z-40 flex items-center justify-center p-8"
    >
      <img
        :src="`data:image/png;base64,${preview.image.base64}`"
        class="max-h-[70%] max-w-[70%] rounded-lg border border-border/60 bg-card object-contain shadow-2xl"
      />
    </div>

    <!-- 轻提示 -->
    <Transition name="toast">
      <div
        v-if="toastMsg"
        class="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center"
      >
        <div
          class="rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground shadow-lg"
        >
          {{ toastMsg }}
        </div>
      </div>
    </Transition>

    <!-- 清空确认 -->
    <Dialog :open="showClearConfirm" @update:open="showClearConfirm = $event">
      <DialogContent class="max-w-sm">
        <DialogHeader>
          <DialogTitle>清空全部记录？</DialogTitle>
          <DialogDescription>
            将删除全部 {{ records.length }} 条剪贴记录，此操作不可撤销。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" size="sm" @click="showClearConfirm = false">取消</Button>
          <Button variant="destructive" size="sm" @click="confirmClear">清空</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped>
.drag-region {
  -webkit-app-region: drag;
}
.no-drag {
  -webkit-app-region: no-drag;
}
.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
