<script setup lang="ts">
import type { ClipRecord } from '@shared/types'
import { clipImageSrc } from '@shared/types'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { Check, ChevronDown, ChevronUp, Star, Trash2 } from 'lucide-vue-next'
import { formatBytes, formatTime } from '@renderer/modules/clipboard/lib/time'

/** 折叠预览进 DOM 的上限；超长文本整段排版会卡死 Layout */
const CLAMP_CHARS = 480
/** 展开后仍截断，避免把百万字塞进可滚动区域 */
const EXPAND_CHARS = 8000

const props = defineProps<{
  record: ClipRecord
  active: boolean
  selected: boolean
  /** 是否为收藏条目（决定星标实心/空心与点击语义） */
  favorited?: boolean
}>()

const emit = defineEmits<{
  (e: 'activate', record: ClipRecord, event: MouseEvent): void
  (e: 'commit', record: ClipRecord): void
  (e: 'remove', record: ClipRecord): void
  (e: 'toggle-favorite', record: ClipRecord): void
  (e: 'preview', record: ClipRecord | null): void
}>()

const imageSrc = computed(() =>
  props.record.image ? clipImageSrc(props.record.image.fileId) : ''
)

const textEl = ref<HTMLElement | null>(null)
const expanded = ref(false)
const canToggle = ref(false)

const textLen = computed(() => props.record.text?.length ?? 0)

/** 列表只渲染截断预览，完整内容仍在 record 上供粘贴 */
const displayText = computed(() => {
  const text = props.record.text ?? ''
  const max = expanded.value ? EXPAND_CHARS : CLAMP_CHARS
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n…`
})

function measureOverflow(): void {
  if (expanded.value) return
  // 已超过折叠截断上限：一定能展开，无需读 layout
  if (textLen.value > CLAMP_CHARS) {
    canToggle.value = true
    return
  }
  const el = textEl.value
  if (!el) {
    canToggle.value = false
    return
  }
  el.scrollTop = 0
  canToggle.value = el.scrollHeight > el.clientHeight + 1
}

function toggleExpand(e: MouseEvent): void {
  e.stopPropagation()
  expanded.value = !expanded.value
  if (!expanded.value) nextTick(measureOverflow)
  else canToggle.value = true
}

function onClick(e: MouseEvent): void {
  emit('activate', props.record, e)
}

watch(
  () => [props.record.id, props.record.text] as const,
  () => {
    expanded.value = false
    nextTick(measureOverflow)
  }
)

onMounted(() => {
  nextTick(measureOverflow)
})
</script>

<template>
  <div
    data-clip-card
    class="card"
    :data-active="active"
    :data-selected="selected"
    @click="onClick"
    @dblclick="emit('commit', record)"
  >
    <span v-if="selected" class="card-check" aria-hidden="true">
      <Check class="card-check-icon" />
    </span>

    <template v-if="record.type === 'text'">
      <div class="card-body" :class="{ 'card-body--offset': selected }">
        <p ref="textEl" class="card-text" :class="expanded ? 'is-expanded' : 'is-clamped'">
          {{ displayText }}
        </p>
        <div class="card-meta">
          <span>{{ formatTime(record.createdAt) }}</span>
          <span class="dot">·</span>
          <span>{{ textLen }} 字</span>
          <button v-if="canToggle" type="button" class="expand-btn" @click="toggleExpand">
            <template v-if="expanded">
              收起
              <ChevronUp class="expand-icon" aria-hidden="true" />
            </template>
            <template v-else>
              展开
              <ChevronDown class="expand-icon" aria-hidden="true" />
            </template>
          </button>
        </div>
      </div>
    </template>

    <template v-else>
      <img
        :src="imageSrc"
        class="thumb"
        draggable="false"
        alt=""
        @mouseenter="emit('preview', record)"
        @mouseleave="emit('preview', null)"
      />
      <div class="card-body">
        <p class="card-title">图片</p>
        <div class="card-meta">
          <span>{{ formatTime(record.createdAt) }}</span>
          <span class="dot">·</span>
          <span>{{ record.image?.width }} × {{ record.image?.height }}</span>
          <span class="dot">·</span>
          <span>{{ formatBytes(record.image?.byteLength ?? 0) }}</span>
        </div>
      </div>
    </template>

    <div class="card-actions">
      <button
        type="button"
        class="action-btn"
        :class="favorited ? 'is-favorited' : 'is-ghost'"
        :title="favorited ? '取消收藏' : '收藏'"
        :aria-label="favorited ? '取消收藏' : '收藏'"
        :aria-pressed="favorited"
        @click.stop="emit('toggle-favorite', record)"
      >
        <Star class="action-icon" :fill="favorited ? 'currentColor' : 'none'" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="action-btn is-ghost is-danger"
        title="删除"
        aria-label="删除"
        @click.stop="emit('remove', record)"
      >
        <Trash2 class="action-icon" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.card {
  position: relative;
  display: flex;
  cursor: pointer;
  align-items: center;
  gap: 14px;
  border-radius: 12px;
  padding: 12px 14px;
  content-visibility: auto;
  contain-intrinsic-size: auto 72px;
}

.card:hover {
  background: color-mix(in oklab, var(--foreground) 6%, transparent);
}

.card[data-active='true'] {
  background: color-mix(in oklab, var(--primary) 10%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--primary) 40%, transparent);
}

.card[data-selected='true']:not([data-active='true']) {
  background: color-mix(in oklab, var(--primary) 5%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--primary) 25%, transparent);
}

.card-check {
  position: absolute;
  top: 8px;
  left: 8px;
  display: flex;
  width: 16px;
  height: 16px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--primary);
  color: var(--primary-foreground);
}

.card-check-icon {
  width: 10px;
  height: 10px;
}

.card-body {
  min-width: 0;
  flex: 1;
}

.card-body--offset {
  padding-left: 12px;
}

.card-text {
  font-size: 13.5px;
  line-height: 1.25rem;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  color: color-mix(in oklab, var(--foreground) 95%, transparent);
}

.card-text.is-clamped {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  overflow: hidden;
}

.card-text.is-expanded {
  max-height: 10rem;
  overflow-y: auto;
}

.card-title {
  font-size: 13.5px;
  font-weight: 500;
  color: color-mix(in oklab, var(--foreground) 90%, transparent);
}

.card-meta {
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--muted-foreground);
}

.dot {
  opacity: 0.3;
}

.expand-btn {
  display: inline-flex;
  cursor: pointer;
  align-items: center;
  gap: 2px;
  color: var(--primary);
}

.expand-btn:hover {
  opacity: 0.8;
}

.expand-icon {
  width: 12px;
  height: 12px;
}

.thumb {
  height: 56px;
  width: 96px;
  flex-shrink: 0;
  border-radius: 8px;
  object-fit: cover;
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--border) 60%, transparent);
}

.card-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 2px;
}

.action-btn {
  display: flex;
  width: 32px;
  height: 32px;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition:
    color 0.2s ease,
    background 0.2s ease,
    opacity 0.2s ease;
}

.action-icon {
  width: 14px;
  height: 14px;
}

.action-btn.is-favorited {
  color: #fbbf24;
  opacity: 1;
}

.action-btn.is-favorited:hover {
  background: color-mix(in oklab, #fbbf24 16%, transparent);
}

.action-btn.is-ghost {
  color: var(--muted-foreground);
  opacity: 0;
}

.card:hover .action-btn.is-ghost,
.action-btn.is-ghost:focus-visible {
  opacity: 1;
}

.action-btn.is-ghost:hover {
  background: color-mix(in oklab, var(--foreground) 10%, transparent);
  color: #fbbf24;
}

.action-btn.is-danger:hover {
  background: color-mix(in oklab, var(--destructive) 14%, transparent);
  color: var(--destructive);
}
</style>
