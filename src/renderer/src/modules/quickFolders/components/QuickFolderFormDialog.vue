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
/** 外部文件夹拖入路径行时的高亮 */
const pathDropActive = ref(false)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    formPath.value = props.initialPath
    formNote.value = props.initialNote
    formError.value = ''
    formBusy.value = false
    pathDropActive.value = false
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

/** 是否为从访达 / 资源管理器拖入的本地文件 */
function isExternalFileDrag(e: DragEvent): boolean {
  const types = e.dataTransfer?.types
  if (!types) return false
  return Array.from(types).includes('Files')
}

function onPathDragEnter(e: DragEvent): void {
  if (!isExternalFileDrag(e)) return
  e.preventDefault()
  pathDropActive.value = true
}

function onPathDragOver(e: DragEvent): void {
  if (!isExternalFileDrag(e)) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  pathDropActive.value = true
}

function onPathDragLeave(e: DragEvent): void {
  const next = e.relatedTarget as Node | null
  const current = e.currentTarget as Node
  // 移入子节点不算离开
  if (next && current.contains(next)) return
  pathDropActive.value = false
}

function onPathDrop(e: DragEvent): void {
  e.preventDefault()
  pathDropActive.value = false
  if (!isExternalFileDrag(e)) return

  const dt = e.dataTransfer
  if (!dt?.files?.length) return

  // 优先用 entry 判断是否目录，避免拖入普通文件才在保存时失败
  const item = dt.items?.[0]
  const entry = item?.webkitGetAsEntry?.()
  if (entry && !entry.isDirectory) {
    formError.value = '请拖入文件夹'
    return
  }

  const file = dt.files[0]
  if (!file) return
  try {
    const path = window.api.quickFolders.getPathForFile(file)
    if (!path) {
      formError.value = '无法读取路径'
      return
    }
    formPath.value = path
    formError.value = ''
  } catch {
    formError.value = '无法读取路径'
  }
}

defineExpose({ setError, setBusy, setPath, close })
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ mode === 'add' ? '添加文件夹' : '编辑文件夹' }}</DialogTitle>
        <DialogDescription>
          备注可选；无备注时列表显示文件夹名与路径。可将文件夹拖入路径框。
        </DialogDescription>
      </DialogHeader>
      <div class="form">
        <label class="form-label">
          <span>路径</span>
          <div
            class="path-row"
            :class="{ 'path-row--drop': pathDropActive }"
            @dragenter="onPathDragEnter"
            @dragover="onPathDragOver"
            @dragleave="onPathDragLeave"
            @drop="onPathDrop"
          >
            <Input
              v-model="formPath"
              placeholder="粘贴、拖入或选择文件夹路径"
              class="flex-1"
            />
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
  border-radius: 8px;
  outline: 2px solid transparent;
  outline-offset: 2px;
  transition: outline-color 0.12s ease;
}

.path-row--drop {
  outline-color: color-mix(in oklab, var(--primary) 70%, transparent);
}

.form-error {
  margin: 0;
  font-size: 12px;
  color: var(--destructive);
}
</style>
