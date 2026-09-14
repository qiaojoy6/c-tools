<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Plus, Search } from 'lucide-vue-next'

const search = defineModel<string>('search', { default: '' })

const emit = defineEmits<{
  add: []
}>()

const root = ref<HTMLElement | null>(null)

/** 供父级聚焦 / 失焦搜索框 */
function focusInput(): void {
  root.value?.querySelector('input')?.focus()
}

function blurInput(): void {
  root.value?.querySelector('input')?.blur()
}

defineExpose({ focusInput, blurInput })
</script>

<template>
  <header ref="root" class="header drag-region">
    <div class="search">
      <Search class="search-icon" aria-hidden="true" />
      <Input
        v-model="search"
        placeholder="搜索备注或路径…"
        aria-label="搜索快捷文件夹"
        class="search-input no-drag"
      />
      <kbd v-if="!search" class="search-hint">⌘F</kbd>
    </div>
    <Button variant="secondary" size="sm" class="add-btn no-drag" @click="emit('add')">
      <Plus class="add-icon" aria-hidden="true" />
      添加
    </Button>
  </header>
</template>

<style scoped>
.header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid color-mix(in oklab, var(--border) 50%, transparent);
  padding: 12px 14px 10px;
}

.search {
  position: relative;
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
}

.search-icon {
  pointer-events: none;
  position: absolute;
  left: 10px;
  z-index: 1;
  width: 15px;
  height: 15px;
  color: var(--muted-foreground);
}

.search-input {
  height: 34px;
  padding-left: 32px;
  padding-right: 44px;
}

.search-hint {
  pointer-events: none;
  position: absolute;
  right: 10px;
  border-radius: 4px;
  background: color-mix(in oklab, var(--muted) 70%, transparent);
  padding: 1px 5px;
  font-family: inherit;
  font-size: 10px;
  color: var(--muted-foreground);
}

.add-btn {
  gap: 4px;
}

.add-icon {
  width: 14px;
  height: 14px;
}

.drag-region {
  -webkit-app-region: drag;
}

.no-drag {
  -webkit-app-region: no-drag;
}
</style>
