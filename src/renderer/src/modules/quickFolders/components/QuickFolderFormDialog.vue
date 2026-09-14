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
  mode: 'add' | 'edit'
  initialPath: string
  initialNote: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  save: [payload: { path: string; note: string }]
  browse: []
}>()

const formPath = ref('')
const formNote = ref('')
const formError = ref('')
const formBusy = ref(false)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    formPath.value = props.initialPath
    formNote.value = props.initialNote
    formError.value = ''
    formBusy.value = false
  }
)

function setError(message: string): void {
  formError.value = message
  formBusy.value = false
}

function setBusy(busy: boolean): void {
  formBusy.value = busy
}

function setPath(path: string): void {
  formPath.value = path
}

function close(): void {
  emit('update:open', false)
}

function onSubmit(): void {
  formError.value = ''
  formBusy.value = true
  emit('save', { path: formPath.value, note: formNote.value })
}

defineExpose({ setError, setBusy, setPath, close })
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ mode === 'add' ? '添加文件夹' : '编辑文件夹' }}</DialogTitle>
        <DialogDescription>备注可选；无备注时列表显示文件夹名与路径。</DialogDescription>
      </DialogHeader>
      <div class="form">
        <label class="form-label">
          <span>路径</span>
          <div class="path-row">
            <Input v-model="formPath" placeholder="粘贴或选择文件夹路径" class="flex-1" />
            <Button type="button" variant="outline" size="sm" @click="emit('browse')">
              浏览…
            </Button>
          </div>
        </label>
        <label class="form-label">
          <span>备注（可选）</span>
          <Input v-model="formNote" placeholder="例如：客户资料" />
        </label>
        <p v-if="formError" class="form-error">{{ formError }}</p>
      </div>
      <DialogFooter>
        <Button variant="ghost" @click="close">取消</Button>
        <Button :disabled="formBusy || !formPath.trim()" @click="onSubmit">确定</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-block: 4px;
}

.form-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--muted-foreground);
}

.path-row {
  display: flex;
  gap: 8px;
}

.form-error {
  margin: 0;
  font-size: 12px;
  color: var(--destructive);
}
</style>
