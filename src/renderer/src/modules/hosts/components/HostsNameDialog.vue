<script setup lang="ts">
import { ref, watch } from 'vue'
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

const props = defineProps<{
  open: boolean
  mode: 'add' | 'rename'
  initialName?: string
  busy?: boolean
  error?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  submit: [name: string]
}>()

const name = ref('')

watch(
  () => props.open,
  (v) => {
    if (v) name.value = props.initialName ?? ''
  }
)

function submit(): void {
  emit('submit', name.value.trim())
}
</script>

<template>
  <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogContent class="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>{{ mode === 'add' ? '添加 Hosts 方案' : '重命名' }}</DialogTitle>
        <DialogDescription>
          {{
            mode === 'add'
              ? '创建后立刻保存到本地，开关默认关闭。'
              : '仅改展示名，系统标记仍使用 id。'
          }}
        </DialogDescription>
      </DialogHeader>
      <Input
        v-model="name"
        placeholder="方案名称"
        :disabled="busy"
        @keydown.enter.prevent="submit"
      />
      <p v-if="error" class="text-xs text-destructive">{{ error }}</p>
      <DialogFooter>
        <Button type="button" variant="outline" :disabled="busy" @click="emit('update:open', false)">
          取消
        </Button>
        <Button type="button" :disabled="busy || !name.trim()" @click="submit">
          {{ busy ? '处理中…' : '确定' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
