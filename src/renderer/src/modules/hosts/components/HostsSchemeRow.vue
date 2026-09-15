<script setup lang="ts">
import { ref } from 'vue'
import type { HostsScheme } from '@shared/types'
import { GripVertical, Pencil, Trash2 } from 'lucide-vue-next'
import { Switch } from '@renderer/components/ui/switch'
import { Button } from '@renderer/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@renderer/components/ui/context-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'

const props = defineProps<{
  scheme: HostsScheme
  active: boolean
  dragOver: boolean
  busy: boolean
}>()

const emit = defineEmits<{
  select: []
  toggle: [enabled: boolean]
  rename: []
  remove: []
  dragstart: [e: DragEvent]
  dragover: [e: DragEvent]
  drop: [e: DragEvent]
  dragend: []
}>()

const confirmOpen = ref(false)

function askRemove(): void {
  if (props.busy || props.scheme.enabled) return
  confirmOpen.value = true
}

function confirmRemove(): void {
  confirmOpen.value = false
  emit('remove')
}
</script>

<template>
  <ContextMenu>
    <ContextMenuTrigger as-child>
      <li
        class="scheme-row"
        :class="{ active, 'drag-over': dragOver }"
        draggable="true"
        @click="emit('select')"
        @contextmenu="emit('select')"
        @dragstart="emit('dragstart', $event)"
        @dragover="emit('dragover', $event)"
        @drop="emit('drop', $event)"
        @dragend="emit('dragend')"
      >
        <GripVertical class="grip" aria-hidden="true" />
        <div class="meta min-w-0 flex-1">
          <p class="name truncate">{{ scheme.name }}</p>
          <p v-if="scheme.enabled" class="hint">已写入系统</p>
        </div>
        <Switch
          :model-value="scheme.enabled"
          :disabled="busy"
          @click.stop
          @update:model-value="(v) => emit('toggle', Boolean(v))"
        />
      </li>
    </ContextMenuTrigger>

    <ContextMenuContent class="w-40">
      <ContextMenuItem :disabled="busy" class="gap-2" @select="emit('rename')">
        <Pencil class="h-3.5 w-3.5" />
        重命名
      </ContextMenuItem>
      <ContextMenuItem
        :disabled="busy || scheme.enabled"
        variant="destructive"
        class="gap-2"
        @select="askRemove"
      >
        <Trash2 class="h-3.5 w-3.5" />
        {{ scheme.enabled ? '删除（请先关闭）' : '删除' }}
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>

  <Dialog :open="confirmOpen" @update:open="(v) => (confirmOpen = v)">
    <DialogContent class="max-w-sm">
      <DialogHeader>
        <DialogTitle>删除 Hosts 方案？</DialogTitle>
        <DialogDescription>
          将删除「{{ scheme.name }}」，仅移除本地方案，此操作不可撤销。
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" size="sm" @click="confirmOpen = false">取消</Button>
        <Button variant="destructive" size="sm" :disabled="busy" @click="confirmRemove">
          删除
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.scheme-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.45rem 0.5rem;
  border-radius: 0.5rem;
  cursor: pointer;
  border: 1px solid transparent;
}
.scheme-row:hover {
  background: color-mix(in oklab, var(--muted) 70%, transparent);
}
.scheme-row.active {
  background: color-mix(in oklab, var(--primary) 12%, transparent);
  border-color: color-mix(in oklab, var(--primary) 28%, transparent);
}
.scheme-row.drag-over {
  border-color: var(--primary);
}
.grip {
  width: 0.9rem;
  height: 0.9rem;
  flex-shrink: 0;
  opacity: 0.35;
}
.name {
  font-size: 0.8125rem;
  font-weight: 500;
  line-height: 1.2;
}
.hint {
  margin-top: 0.1rem;
  font-size: 0.65rem;
  color: var(--muted-foreground);
}
</style>
