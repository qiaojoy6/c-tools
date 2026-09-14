<script setup lang="ts">
import type { QuickFolderItem } from '@shared/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { primaryLabel } from '@renderer/modules/quickFolders/label'

defineProps<{
  open: boolean
  item: QuickFolderItem | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: []
}>()
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-w-sm">
      <DialogHeader>
        <DialogTitle>删除快捷文件夹？</DialogTitle>
        <DialogDescription>
          <template v-if="item">
            将删除「{{ primaryLabel(item) }}」，此操作不可撤销。
          </template>
          <template v-else>确定删除该条目？此操作不可撤销。</template>
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" size="sm" @click="emit('update:open', false)">取消</Button>
        <Button variant="destructive" size="sm" @click="emit('confirm')">删除</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
