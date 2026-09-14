<script setup lang="ts">
import type { QuickFolderItem } from '@shared/types'
import { ref } from 'vue'
import QuickFolderRow from './QuickFolderRow.vue'
import { FolderOpen } from 'lucide-vue-next'

const props = defineProps<{
  items: QuickFolderItem[]
  highlight: number
  /** 搜索中禁止拖拽，避免与全量顺序错位 */
  dragDisabled: boolean
  emptySearch: boolean
}>()

const emit = defineEmits<{
  'update:highlight': [index: number]
  open: [item: QuickFolderItem]
  edit: [item: QuickFolderItem]
  remove: [item: QuickFolderItem]
  reorder: [from: number, to: number]
}>()

const dragFrom = ref<number | null>(null)
const dragOver = ref<number | null>(null)

function onDragStart(index: number, e: DragEvent): void {
  if (props.dragDisabled) {
    e.preventDefault()
    return
  }
  dragFrom.value = index
  e.dataTransfer?.setData('text/plain', String(index))
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onDragOver(index: number, e: DragEvent): void {
  e.preventDefault()
  dragOver.value = index
}

function onDrop(index: number, e: DragEvent): void {
  e.preventDefault()
  const from = dragFrom.value
  dragFrom.value = null
  dragOver.value = null
  if (from === null || from === index || props.dragDisabled) return
  emit('reorder', from, index)
}

function onDragEnd(): void {
  dragFrom.value = null
  dragOver.value = null
}
</script>

<template>
  <div class="list">
    <ul v-if="items.length > 0" class="rows" role="listbox" aria-label="快捷文件夹">
      <QuickFolderRow
        v-for="(item, index) in items"
        :key="item.id"
        :item="item"
        :active="index === highlight"
        :drag-over="dragOver === index"
        @select="emit('update:highlight', index)"
        @open="emit('open', item)"
        @edit="emit('edit', item)"
        @remove="emit('remove', item)"
        @dragstart="onDragStart(index, $event)"
        @dragover="onDragOver(index, $event)"
        @drop="onDrop(index, $event)"
        @dragend="onDragEnd"
      />
    </ul>
    <div v-else class="empty">
      <div class="empty-icon-wrap">
        <FolderOpen class="empty-icon" aria-hidden="true" />
      </div>
      <div class="empty-copy">
        <p class="empty-title">{{ emptySearch ? '没有匹配的文件夹' : '还没有快捷文件夹' }}</p>
        <p class="empty-desc">
          {{ emptySearch ? '试试换个关键词' : '点「添加」选目录或粘贴路径' }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.list {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 8px 10px;
}

.rows {
  margin: 0;
  padding: 0;
  list-style: none;
}

.empty {
  display: flex;
  height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  text-align: center;
}

.empty-icon-wrap {
  display: flex;
  width: 48px;
  height: 48px;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: color-mix(in oklab, var(--muted) 60%, transparent);
}

.empty-icon {
  width: 22px;
  height: 22px;
  color: var(--muted-foreground);
}

.empty-title {
  margin: 0;
  font-size: 14px;
  font-weight: 560;
}

.empty-desc {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--muted-foreground);
}
</style>
