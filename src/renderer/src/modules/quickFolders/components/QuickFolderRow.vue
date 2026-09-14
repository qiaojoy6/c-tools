<script setup lang="ts">
import type { QuickFolderItem } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { primaryLabel } from '@renderer/modules/quickFolders/label'
import { GripVertical, Pencil, Trash2 } from 'lucide-vue-next'

defineProps<{
  item: QuickFolderItem
  active: boolean
  dragOver: boolean
}>()

const emit = defineEmits<{
  select: []
  open: []
  edit: []
  remove: []
  dragstart: [e: DragEvent]
  dragover: [e: DragEvent]
  drop: [e: DragEvent]
  dragend: []
}>()
</script>

<template>
  <li
    class="row"
    :class="{ active, invalid: !item.valid, 'drag-over': dragOver }"
    role="option"
    :aria-selected="active"
    draggable="true"
    @click="emit('select')"
    @dblclick="emit('open')"
    @dragstart="emit('dragstart', $event)"
    @dragover="emit('dragover', $event)"
    @drop="emit('drop', $event)"
    @dragend="emit('dragend')"
  >
    <span class="grip" title="拖拽排序" aria-hidden="true">
      <GripVertical class="grip-icon" />
    </span>
    <div class="row-body">
      <div class="row-title">
        <span class="title-text">{{ primaryLabel(item) }}</span>
        <span v-if="!item.valid" class="badge-invalid">路径无效</span>
      </div>
      <p class="row-path">{{ item.path }}</p>
    </div>
    <div class="row-actions no-drag">
      <Button
        v-if="item.valid"
        variant="ghost"
        size="icon-sm"
        title="编辑"
        aria-label="编辑"
        @click.stop="emit('edit')"
      >
        <Pencil class="action-icon" aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        title="删除"
        aria-label="删除"
        class="danger-btn"
        @click.stop="emit('remove')"
      >
        <Trash2 class="action-icon" aria-hidden="true" />
      </Button>
    </div>
  </li>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 10px;
  padding: 8px 8px 8px 4px;
  cursor: default;
  transition: background 0.12s ease;
}

.row:hover,
.row.active {
  background: color-mix(in oklab, var(--accent) 70%, transparent);
}

.row.invalid {
  opacity: 0.72;
}

.row.drag-over {
  outline: 1px dashed color-mix(in oklab, var(--primary) 55%, transparent);
}

.grip {
  display: flex;
  width: 20px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  color: var(--muted-foreground);
  cursor: grab;
}

.grip-icon {
  width: 14px;
  height: 14px;
}

.row-body {
  min-width: 0;
  flex: 1;
}

.row-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
}

.badge-invalid {
  flex-shrink: 0;
  border-radius: 999px;
  background: color-mix(in oklab, var(--destructive) 16%, transparent);
  padding: 1px 7px;
  font-size: 10px;
  font-weight: 500;
  color: var(--destructive);
}

.row-path {
  margin: 2px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--muted-foreground);
}

.row-actions {
  display: flex;
  flex-shrink: 0;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.12s ease;
}

.row:hover .row-actions,
.row.active .row-actions {
  opacity: 1;
}

.action-icon {
  width: 14px;
  height: 14px;
}

.danger-btn:hover {
  background: color-mix(in oklab, var(--destructive) 14%, transparent);
  color: var(--destructive);
}

.no-drag {
  -webkit-app-region: no-drag;
}
</style>
