<script setup lang="ts">
import type { ClipRecord } from '@shared/types'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { Badge } from '@renderer/components/ui/badge'
import { Check, ChevronDown, ChevronUp, Star, Trash2 } from 'lucide-vue-next'
import { formatBytes, formatTime } from '@renderer/modules/clipboard/lib/time'
import { cn } from '@renderer/lib/utils'

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

const imageDataUrl = computed(() =>
  props.record.image ? `data:image/png;base64,${props.record.image.base64}` : ''
)

const textEl = ref<HTMLElement | null>(null)
const expanded = ref(false)
const canToggle = ref(false)

function measureOverflow(): void {
  if (expanded.value) return
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
  nextTick(() => {
    measureOverflow()
  })
})
</script>

<template>
  <div
    data-clip-card
    :data-active="active"
    :class="
      cn(
        'group relative flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-all duration-150',
        active
          ? 'border-primary/40 bg-accent ring-1 ring-primary/30'
          : 'border-transparent hover:bg-accent/60',
        selected && 'border-primary/60 bg-primary/10'
      )
    "
    @click="onClick"
    @dblclick="emit('commit', record)"
  >
    <!-- 选中标记 -->
    <span
      v-if="selected"
      class="absolute -top-1.5 -left-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground shadow"
    >
      <Check class="size-3" />
    </span>

    <!-- 文本记录 -->
    <template v-if="record.type === 'text'">
      <div class="min-w-0 flex-1">
        <p
          ref="textEl"
          :class="
            cn(
              'text-[13px] leading-5 break-all whitespace-pre-wrap',
              expanded ? 'max-h-40 overflow-y-auto' : 'line-clamp-3'
            )
          "
        >
          {{ record.text }}
        </p>
        <div class="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>{{ formatTime(record.createdAt) }}</span>
          <span class="opacity-40">·</span>
          <span>{{ record.text?.length ?? 0 }} 字符</span>
          <button
            v-if="canToggle"
            type="button"
            class="inline-flex cursor-pointer items-center gap-0.5 text-primary hover:underline"
            @click="toggleExpand"
          >
            <template v-if="expanded">
              收起
              <ChevronUp class="size-3" />
            </template>
            <template v-else>
              展开
              <ChevronDown class="size-3" />
            </template>
          </button>
        </div>
      </div>
    </template>

    <!-- 图片记录 -->
    <template v-else>
      <img
        :src="imageDataUrl"
        class="h-14 w-24 shrink-0 rounded-md border border-border/60 bg-card object-cover"
        draggable="false"
        @mouseenter="emit('preview', record)"
        @mouseleave="emit('preview', null)"
      />
      <div class="min-w-0 flex-1">
        <p class="text-[13px]">图片</p>
        <div class="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>{{ formatTime(record.createdAt) }}</span>
          <span class="opacity-40">·</span>
          <span>{{ record.image?.width }} × {{ record.image?.height }}</span>
          <span class="opacity-40">·</span>
          <span>{{ formatBytes(record.image?.base64.length ?? 0) }}</span>
        </div>
      </div>
    </template>

    <!-- 右侧操作：收藏在上、删除在下 -->
    <div class="flex shrink-0 flex-col items-center gap-0.5">
      <button
        class="flex size-7 cursor-pointer items-center justify-center rounded-md transition-all"
        :class="
          favorited
            ? 'text-amber-500 opacity-100 hover:bg-amber-500/10'
            : 'text-muted-foreground opacity-0 hover:bg-accent hover:text-amber-500 group-hover:opacity-100'
        "
        :title="favorited ? '取消收藏' : '收藏'"
        @click.stop="emit('toggle-favorite', record)"
      >
        <Star class="size-3.5" :fill="favorited ? 'currentColor' : 'none'" />
      </button>
      <button
        v-if="!favorited"
        class="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
        title="删除"
        @click.stop="emit('remove', record)"
      >
        <Trash2 class="size-3.5" />
      </button>
      <Badge v-if="selected" variant="soft" class="mt-0.5">已选</Badge>
    </div>
  </div>
</template>
