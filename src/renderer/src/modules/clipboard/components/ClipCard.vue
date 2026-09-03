<script setup lang="ts">
import type { ClipRecord } from '@shared/types'
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Check, Trash2 } from 'lucide-vue-next'
import { formatBytes, formatTime } from '@/modules/clipboard/lib/time'
import { cn } from '@/lib/utils'

const props = defineProps<{
  record: ClipRecord
  active: boolean
  selected: boolean
}>()

const emit = defineEmits<{
  (e: 'activate', record: ClipRecord, event: MouseEvent): void
  (e: 'commit', record: ClipRecord): void
  (e: 'remove', record: ClipRecord): void
  (e: 'preview', record: ClipRecord | null): void
}>()

const imageDataUrl = computed(() =>
  props.record.image ? `data:image/png;base64,${props.record.image.base64}` : ''
)

function onClick(e: MouseEvent): void {
  emit('activate', props.record, e)
}
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
    @mouseenter="emit('preview', record)"
    @mouseleave="emit('preview', null)"
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
        <p class="line-clamp-2 text-[13px] leading-5 break-all whitespace-pre-wrap">
          {{ record.text }}
        </p>
        <div class="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>{{ formatTime(record.createdAt) }}</span>
          <span class="opacity-40">·</span>
          <span>{{ record.text?.length ?? 0 }} 字符</span>
        </div>
      </div>
    </template>

    <!-- 图片记录 -->
    <template v-else>
      <img
        :src="imageDataUrl"
        class="h-14 w-24 shrink-0 rounded-md border border-border/60 bg-card object-cover"
        draggable="false"
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

    <!-- 右侧操作 -->
    <div class="flex shrink-0 items-center gap-1">
      <Badge v-if="selected" variant="soft">已选</Badge>
      <button
        class="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
        title="删除"
        @click.stop="emit('remove', record)"
      >
        <Trash2 class="size-3.5" />
      </button>
    </div>
  </div>
</template>
