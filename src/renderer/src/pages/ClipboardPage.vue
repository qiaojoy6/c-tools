<script setup lang="ts">
import type { ClipRecord } from '@shared/types'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
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
import ClipVirtualList from '@renderer/modules/clipboard/components/ClipVirtualList.vue'
import { useHistory } from '@renderer/modules/clipboard/composables/useHistory'
import { ClipboardList, Image as ImageIcon, Search, Star, Trash2, Type } from 'lucide-vue-next'

type FilterType = 'all' | 'text' | 'image' | 'favorite'

const route = useRoute()
/** 仅独立剪贴板浮层可用 ESC 关闭；功能面板内嵌时 ESC 只清搜索/预览 */
const escToClose = computed(() => route.name === 'clipboard')

const { records, favorites, refresh, remove, clear, addFavorite, removeFavorite, paste } =
  useHistory()

// ---------- 状态 ----------
const search = ref('')
const searchWrap = ref<HTMLElement | null>(null)
const listRef = ref<{ scrollToIndex: (index: number) => void } | null>(null)
const filter = ref<FilterType>('all')
const highlight = ref(0)
const selectedIds = ref<Set<string>>(new Set())
const showClearConfirm = ref(false)
const preview = ref<ClipRecord | null>(null)
const toastMsg = ref('')

const tabs: { label: string; value: FilterType; icon: typeof ClipboardList }[] = [
  { label: '全部', value: 'all', icon: ClipboardList },
  { label: '文本', value: 'text', icon: Type },
  { label: '图片', value: 'image', icon: ImageIcon },
  { label: '收藏', value: 'favorite', icon: Star }
]

let toastTimer: ReturnType<typeof setTimeout> | null = null
/** Shift 范围多选的锚点索引 */
let anchorIndex = -1
let offShown: (() => void) | null = null

const viewingFavorites = computed(() => filter.value === 'favorite')

/** 按内容指纹匹配收藏（避免把整段超长 text/base64 当 Set key） */
function contentKey(r: ClipRecord): string {
  if (r.type === 'text') {
    const t = r.text ?? ''
    if (t.length <= 256) return `text:${t}`
    return `text:${t.length}:${t.slice(0, 64)}:${t.slice(-64)}`
  }
  const b = r.image?.base64 ?? ''
  if (b.length <= 128) return `image:${b}`
  return `image:${b.length}:${b.slice(0, 32)}:${b.slice(-32)}`
}

const favoriteKeys = computed(() => new Set(favorites.value.map(contentKey)))

function isFavorited(record: ClipRecord): boolean {
  return viewingFavorites.value || favoriteKeys.value.has(contentKey(record))
}

// ---------- 过滤 ----------
const filtered = computed<ClipRecord[]>(() => {
  const keyword = search.value.trim().toLowerCase()
  const source = viewingFavorites.value ? favorites.value : records.value
  return source.filter((r) => {
    if (filter.value === 'text' || filter.value === 'image') {
      if (r.type !== filter.value) return false
    }
    if (keyword && (r.type !== 'text' || !r.text?.toLowerCase().includes(keyword))) return false
    return true
  })
})

watch([search, filter], () => {
  highlight.value = 0
  anchorIndex = -1
  nextTick(() => listRef.value?.scrollToIndex(0))
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
    listRef.value?.scrollToIndex(highlight.value)
  })
}

function move(delta: number): void {
  const len = filtered.value.length
  if (len === 0) return
  highlight.value = (highlight.value + delta + len) % len
  preview.value = null
  scrollActive()
}

/** 左右键切换类型 Tab：全部 → 文本 → 图片 → 收藏 */
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
  if (!ok) {
    showToast(
      navigator.userAgent.includes('Windows')
        ? '粘贴失败，请先点击目标窗口后再试'
        : '粘贴失败，请检查系统辅助权限后重试'
    )
  }
  selectedIds.value = new Set()
}

/** 双击：单条直接粘贴 */
async function onCommit(record: ClipRecord): Promise<void> {
  const ok = await paste([record.id])
  if (!ok) {
    showToast(
      navigator.userAgent.includes('Windows')
        ? '粘贴失败，请先点击目标窗口后再试'
        : '粘贴失败，请检查系统辅助权限后重试'
    )
  }
}

function onRemoveCard(record: ClipRecord): void {
  if (viewingFavorites.value) {
    void removeFavorite(record.id)
  } else {
    void remove(record.id)
  }
  const next = new Set(selectedIds.value)
  next.delete(record.id)
  selectedIds.value = next
}

async function onToggleFavorite(record: ClipRecord): Promise<void> {
  if (viewingFavorites.value) {
    await removeFavorite(record.id)
    const next = new Set(selectedIds.value)
    next.delete(record.id)
    selectedIds.value = next
    return
  }

  // 历史列表：已点亮则按内容取消对应收藏，否则新增
  const key = contentKey(record)
  if (favoriteKeys.value.has(key)) {
    const fav = favorites.value.find((f) => contentKey(f) === key)
    if (fav) await removeFavorite(fav.id)
    return
  }

  const ok = await addFavorite(record.id)
  if (!ok) showToast('已在收藏中')
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
  showToast('已清空历史记录（收藏不受影响）')
}

function onPreview(record: ClipRecord | null): void {
  preview.value = record?.type === 'image' ? record : null
}

function hidePanel(): void {
  window.api.hidePanel()
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
    } else if (escToClose.value) {
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
  <div class="page">
    <header class="header drag-region">
      <div ref="searchWrap" class="search">
        <Search class="search-icon" aria-hidden="true" />
        <Input
          v-model="search"
          placeholder="搜索剪贴记录…"
          aria-label="搜索剪贴记录"
          class="search-input no-drag"
        />
        <kbd v-if="!search" class="search-hint">⌘F</kbd>
      </div>

      <div class="filters no-drag" role="tablist" aria-label="类型筛选">
        <button
          v-for="tab in tabs"
          :key="tab.value"
          type="button"
          class="filter-chip"
          role="tab"
          :aria-selected="filter === tab.value"
          @click="filter = tab.value"
        >
          <component :is="tab.icon" class="filter-icon" aria-hidden="true" />
          {{ tab.label }}
        </button>
      </div>
    </header>

    <main class="list">
      <ClipVirtualList
        v-if="filtered.length > 0"
        ref="listRef"
        :records="filtered"
        :highlight="highlight"
        :selected-ids="selectedIds"
        :is-favorited="isFavorited"
        @activate="onActivate"
        @commit="onCommit"
        @remove="onRemoveCard"
        @toggle-favorite="onToggleFavorite"
        @preview="onPreview"
      />
      <div v-else class="empty">
        <div class="empty-icon-wrap">
          <ClipboardList class="empty-icon" aria-hidden="true" />
        </div>
        <div class="empty-copy">
          <p class="empty-title">
            {{
              viewingFavorites
                ? search
                  ? '没有匹配的收藏'
                  : '还没有收藏'
                : search || filter !== 'all'
                  ? '没有匹配的记录'
                  : '剪贴板还是空的'
            }}
          </p>
          <p class="empty-desc">
            {{
              viewingFavorites
                ? search
                  ? '试试换个关键词'
                  : '点星标即可把常用内容钉在这里'
                : search || filter !== 'all'
                  ? '调整筛选或清空搜索再试试'
                  : '去复制一段文字或截图，马上会出现在这里'
            }}
          </p>
        </div>
      </div>
    </main>

    <footer class="footer">
      <span class="count">
        {{ filtered.length }} 条
        <template v-if="selectedIds.size > 0">
          · <span class="count-selected">已选 {{ selectedIds.size }}</span>
        </template>
      </span>
      <div class="hints">
        <span class="hint"><kbd class="kbd">↵</kbd> 粘贴</span>
        <span class="hint"><kbd class="kbd">←→</kbd> 筛选</span>
        <span class="hint"><kbd class="kbd">⌫</kbd> 删</span>
      </div>
      <div class="footer-actions no-drag">
        <Button
          v-if="!viewingFavorites"
          variant="ghost"
          size="icon-sm"
          title="清空历史"
          aria-label="清空历史"
          class="clear-btn"
          @click="showClearConfirm = true"
        >
          <Trash2 class="clear-icon" aria-hidden="true" />
        </Button>
      </div>
    </footer>

    <div v-if="preview?.image" class="preview-scrim">
      <img
        :src="`data:image/png;base64,${preview.image.base64}`"
        class="preview-img"
        alt="预览"
      />
    </div>

    <Transition name="toast">
      <div v-if="toastMsg" class="toast-wrap">
        <div class="toast">{{ toastMsg }}</div>
      </div>
    </Transition>

    <Dialog :open="showClearConfirm" @update:open="showClearConfirm = $event">
      <DialogContent class="max-w-sm">
        <DialogHeader>
          <DialogTitle>清空历史记录？</DialogTitle>
          <DialogDescription>
            将删除全部 {{ records.length }} 条历史记录，收藏不受影响。此操作不可撤销。
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
.page {
  display: flex;
  height: 100%;
  flex-direction: column;
  overflow: hidden;
}

.header {
  flex-shrink: 0;
  padding: 16px 16px 12px;
}

.header > * + * {
  margin-top: 12px;
}

.search {
  position: relative;
  min-width: 0;
}

.search-icon {
  pointer-events: none;
  position: absolute;
  top: 50%;
  left: 14px;
  width: 16px;
  height: 16px;
  transform: translateY(-50%);
  color: var(--muted-foreground);
}

.search-input {
  height: 44px;
  border-radius: 12px;
  border-color: color-mix(in oklab, var(--border) 50%, transparent);
  background: var(--surface-elevated);
  padding-left: 15px;
  font-size: 15px;
  box-shadow: none;
  backdrop-filter: blur(8px);
}

.search-input::placeholder {
  color: color-mix(in oklab, var(--muted-foreground) 70%, transparent);
}

.search-hint {
  pointer-events: none;
  position: absolute;
  top: 50%;
  right: 12px;
  display: inline;
  transform: translateY(-50%);
  border-radius: 6px;
  border: 1px solid color-mix(in oklab, var(--border) 60%, transparent);
  background: color-mix(in oklab, var(--muted) 40%, transparent);
  padding: 2px 6px;
  font-family: inherit;
  font-size: 10px;
  color: var(--muted-foreground);
}

.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.filter-chip {
  display: inline-flex;
  height: 32px;
  cursor: pointer;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--muted-foreground);
  background: color-mix(in oklab, var(--muted) 50%, transparent);
  transition:
    color 0.2s ease,
    background 0.2s ease,
    box-shadow 0.2s ease;
}

.filter-chip:hover {
  background: color-mix(in oklab, var(--foreground) 10%, var(--muted));
  color: var(--foreground);
}

.filter-chip[aria-selected='true'] {
  background: var(--primary);
  color: var(--primary-foreground);
  box-shadow: 0 1px 2px rgb(0 0 0 / 12%);
}

.filter-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.list {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
}

.empty {
  display: flex;
  height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 0 24px;
  text-align: center;
  color: var(--muted-foreground);
}

.empty-icon-wrap {
  display: flex;
  width: 56px;
  height: 56px;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  background: color-mix(in oklab, var(--muted) 40%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--border) 50%, transparent);
}

.empty-icon {
  width: 28px;
  height: 28px;
  opacity: 0.5;
}

.empty-copy > * + * {
  margin-top: 4px;
}

.empty-title {
  font-size: 14px;
  font-weight: 500;
  color: color-mix(in oklab, var(--foreground) 80%, transparent);
}

.empty-desc {
  font-size: 12px;
  color: var(--muted-foreground);
}

.footer {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 12px;
  border-top: 1px solid color-mix(in oklab, var(--border) 40%, transparent);
  padding: 10px 16px;
  font-size: 12px;
  color: var(--muted-foreground);
}

.count {
  font-variant-numeric: tabular-nums;
}

.count-selected {
  color: var(--primary);
}

.hints {
  margin-left: auto;
  display: none;
  align-items: center;
  gap: 8px;
  opacity: 0.6;
}

@media (min-width: 500px) {
  .hints {
    display: flex;
  }
}

.hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.kbd {
  display: inline-flex;
  height: 20px;
  min-width: 20px;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  border: 1px solid color-mix(in oklab, var(--border) 70%, transparent);
  background: color-mix(in oklab, var(--muted) 50%, transparent);
  padding: 0 4px;
  font-family: inherit;
  font-size: 10px;
  color: var(--muted-foreground);
}

.footer-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
}

.clear-btn {
  color: var(--muted-foreground);
}

.clear-btn:hover {
  background: color-mix(in oklab, var(--destructive) 14%, transparent);
  color: var(--destructive);
}

.clear-icon {
  width: 16px;
  height: 16px;
}

.preview-scrim {
  pointer-events: none;
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 35%);
  padding: 40px;
  backdrop-filter: blur(2px);
}

.preview-img {
  max-height: 72%;
  max-width: 72%;
  border-radius: 16px;
  border: 1px solid rgb(255 255 255 / 15%);
  background: var(--card);
  object-fit: contain;
  box-shadow: 0 25px 50px -12px rgb(0 0 0 / 40%);
}

.toast-wrap {
  pointer-events: none;
  position: fixed;
  inset-inline: 0;
  top: 16px;
  z-index: 50;
  display: flex;
  justify-content: center;
}

.toast {
  border-radius: 999px;
  background: var(--primary);
  padding: 6px 16px;
  font-size: 12px;
  font-weight: 500;
  color: var(--primary-foreground);
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / 20%);
}

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
