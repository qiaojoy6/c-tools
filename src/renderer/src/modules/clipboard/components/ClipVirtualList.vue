<script setup lang="ts">
import type { ClipRecord } from '@shared/types'
import { computed, ref } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import ClipCard from '@renderer/modules/clipboard/components/ClipCard.vue'

const props = defineProps<{
  records: ClipRecord[]
  highlight: number
  selectedIds: Set<string>
  isFavorited: (record: ClipRecord) => boolean
}>()

const emit = defineEmits<{
  (e: 'activate', record: ClipRecord, event: MouseEvent): void
  (e: 'commit', record: ClipRecord): void
  (e: 'remove', record: ClipRecord): void
  (e: 'toggle-favorite', record: ClipRecord): void
  (e: 'preview', record: ClipRecord | null): void
}>()

const parentRef = ref<HTMLElement | null>(null)

/** 估算行高（含卡片 padding）；展开后由 measureElement 校正 */
const ESTIMATE_SIZE = 88
const GAP = 6

const virtualizer = useVirtualizer(
  computed(() => ({
    count: props.records.length,
    getScrollElement: () => parentRef.value,
    estimateSize: () => ESTIMATE_SIZE,
    overscan: 6,
    gap: GAP,
    getItemKey: (index: number) => props.records[index]?.id ?? String(index)
  }))
)

const virtualItems = computed(() => virtualizer.value.getVirtualItems())
const totalSize = computed(() => virtualizer.value.getTotalSize())

function measureElement(el: Element | ComponentPublicInstance | null): void {
  if (!(el instanceof Element)) return
  virtualizer.value.measureElement(el)
}

/** 键盘导航：把高亮项滚进可视区 */
function scrollToIndex(index: number): void {
  if (index < 0 || index >= props.records.length) return
  virtualizer.value.scrollToIndex(index, { align: 'auto' })
}

defineExpose({ scrollToIndex })
</script>

<template>
  <div ref="parentRef" class="clip-virtual-list">
    <div class="clip-virtual-spacer" :style="{ height: `${totalSize}px` }">
      <div
        v-for="row in virtualItems"
        :key="String(row.key)"
        :data-index="row.index"
        :ref="measureElement"
        class="clip-virtual-row"
        :style="{ transform: `translateY(${row.start}px)` }"
      >
        <ClipCard
          :record="records[row.index]!"
          :active="row.index === highlight"
          :selected="selectedIds.has(records[row.index]!.id)"
          :favorited="isFavorited(records[row.index]!)"
          @activate="(r, e) => emit('activate', r, e)"
          @commit="(r) => emit('commit', r)"
          @remove="(r) => emit('remove', r)"
          @toggle-favorite="(r) => emit('toggle-favorite', r)"
          @preview="(r) => emit('preview', r)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.clip-virtual-list {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 0 12px 8px;
}

.clip-virtual-spacer {
  position: relative;
  width: 100%;
}

.clip-virtual-row {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
}
</style>
