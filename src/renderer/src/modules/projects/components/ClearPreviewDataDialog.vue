<script setup lang="ts">
import type { ClearPreviewCacheOptions } from '@shared/types'
import { computed, ref, watch } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'

const props = withDefaults(
  defineProps<{
    open: boolean
    /** origin：只清当前站；all：整分区 */
    mode?: 'origin' | 'all'
    /** mode=origin 时的当前页 origin */
    origin?: string | null
    busy?: boolean
  }>(),
  { mode: 'origin' }
)

const emit = defineEmits<{
  'update:open': [open: boolean]
  confirm: [options: ClearPreviewCacheOptions]
}>()

const originLabel = computed(() => props.origin?.trim() || '')
const isAll = computed(() => props.mode === 'all')

/** 可选项：对齐浏览器「清除浏览数据」 */
const items = [
  {
    key: 'cache' as const,
    label: '缓存的图片和文件',
    hint: '访问过的网页图片、脚本等磁盘缓存'
  },
  {
    key: 'cookies' as const,
    label: 'Cookie 及其他网站数据',
    hint: '登录态、站点偏好等（清除后需重新登录）'
  },
  {
    key: 'localStorage' as const,
    label: '本地存储',
    hint: 'Local Storage 中由网站保存的数据'
  },
  {
    key: 'indexedDB' as const,
    label: 'IndexedDB',
    hint: '网站数据库存储'
  },
  {
    key: 'serviceWorkers' as const,
    label: 'Service Worker',
    hint: '离线缓存与后台脚本'
  }
]

const selected = ref<Record<(typeof items)[number]['key'], boolean>>({
  cache: true,
  cookies: false,
  localStorage: false,
  indexedDB: false,
  serviceWorkers: false
})

watch(
  () => props.open,
  (open) => {
    if (!open) return
    // 每次打开恢复默认：只勾选图片/文件缓存；全部清除时默认全选更符合预期
    selected.value = isAll.value
      ? {
          cache: true,
          cookies: true,
          localStorage: true,
          indexedDB: true,
          serviceWorkers: true
        }
      : {
          cache: true,
          cookies: false,
          localStorage: false,
          indexedDB: false,
          serviceWorkers: false
        }
  }
)

const anySelected = computed(() => Object.values(selected.value).some(Boolean))
const canConfirm = computed(() => {
  if (!anySelected.value || props.busy) return false
  return isAll.value || Boolean(originLabel.value)
})

function close(): void {
  if (props.busy) return
  emit('update:open', false)
}

function confirm(): void {
  if (!canConfirm.value) return
  if (isAll.value) {
    emit('confirm', { ...selected.value, all: true })
    return
  }
  emit('confirm', { ...selected.value, origin: originLabel.value })
}
</script>

<template>
  <Dialog :open="open" @update:open="(v) => !v && close()">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ isAll ? '清除全部预览数据' : '清除此网站数据' }}</DialogTitle>
        <DialogDescription>
          <template v-if="isAll">清除项目预览分区中所有网站的勾选数据（不按地址过滤）</template>
          <template v-else-if="originLabel">
            仅清除 <span class="origin">{{ originLabel }}</span> 的数据
          </template>
          <template v-else>当前页无有效地址，无法清除</template>
        </DialogDescription>
      </DialogHeader>

      <div class="opt-list" role="group" aria-label="清除项目">
        <label v-for="item in items" :key="item.key" class="opt-row">
          <input v-model="selected[item.key]" type="checkbox" :disabled="busy" />
          <span class="opt-text">
            <span class="opt-label">{{ item.label }}</span>
            <span class="opt-hint">{{ item.hint }}</span>
          </span>
        </label>
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" :disabled="busy" @click="close">取消</Button>
        <Button type="button" :disabled="!canConfirm" @click="confirm">清除数据</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.opt-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 0 8px;
}

.opt-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 6px;
  border-radius: 8px;
  cursor: pointer;
  user-select: none;
}

.opt-row:hover {
  background: color-mix(in oklab, var(--foreground) 5%, transparent);
}

.opt-row input {
  margin-top: 2px;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  accent-color: var(--primary);
}

.opt-text {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.opt-label {
  font-size: 13px;
  color: var(--foreground);
  line-height: 1.3;
}

.opt-hint {
  font-size: 11px;
  color: var(--muted-foreground);
  line-height: 1.35;
}

.origin {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  word-break: break-all;
}
</style>
