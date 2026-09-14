<script setup lang="ts">
import { ref } from 'vue'
import { Input } from '@renderer/components/ui/input'
import { Search } from 'lucide-vue-next'

defineProps<{
  placeholder: string
  /** 搜索框无障碍名称 */
  label: string
}>()

const model = defineModel<string>({ default: '' })
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
  <div ref="root" class="search">
    <Search class="search-icon" aria-hidden="true" />
    <Input
      v-model="model"
      :placeholder="placeholder"
      :aria-label="label"
      class="search-input app-no-drag"
    />
    <kbd v-if="!model" class="search-hint">⌘F</kbd>
  </div>
</template>

<style scoped>
.search {
  position: relative;
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  height: 44px;
}

.search-icon {
  pointer-events: none;
  position: absolute;
  top: 50%;
  left: 14px;
  z-index: 1;
  width: 16px;
  height: 16px;
  transform: translateY(-50%);
  color: var(--muted-foreground);
}

.search-input {
  height: 100%;
  border-radius: 12px;
  border-color: color-mix(in oklab, var(--border) 50%, transparent);
  background: var(--surface-elevated);
  padding-left: 40px;
  padding-right: 52px;
  font-size: 15px;
  box-shadow: none;
  backdrop-filter: blur(8px);
}

.search-input::placeholder {
  color: color-mix(in oklab, var(--muted-foreground) 70%, transparent);
}

.search-hint {
  pointer-events: none;
  position: absolute;
  top: 50%;
  right: 12px;
  z-index: 1;
  display: inline;
  transform: translateY(-50%);
  border-radius: 6px;
  border: 1px solid color-mix(in oklab, var(--border) 60%, transparent);
  background: color-mix(in oklab, var(--muted) 40%, transparent);
  padding: 2px 6px;
  font-family: inherit;
  font-size: 10px;
  color: var(--muted-foreground);
}
</style>
