<script setup lang="ts">
import { ref } from 'vue'
import SearchField from '@renderer/components/SearchField.vue'
import { Button } from '@renderer/components/ui/button'
import { Plus } from 'lucide-vue-next'

const search = defineModel<string>('search', { default: '' })

const emit = defineEmits<{
  add: []
}>()

const field = ref<{ focusInput: () => void; blurInput: () => void } | null>(null)

function focusInput(): void {
  field.value?.focusInput()
}

function blurInput(): void {
  field.value?.blurInput()
}

defineExpose({ focusInput, blurInput })
</script>

<template>
  <header class="header app-drag">
    <SearchField
      ref="field"
      v-model="search"
      placeholder="搜索备注或路径…"
      label="搜索快捷文件夹"
    />
    <Button variant="secondary" size="sm" class="add-btn app-no-drag" @click="emit('add')">
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

.add-btn {
  gap: 4px;
  height: 36px;
}

.add-icon {
  width: 14px;
  height: 14px;
}
</style>
