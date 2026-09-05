<script setup lang="ts">
import type { ProjectRuntimeInfo } from '@shared/types'
import { X } from 'lucide-vue-next'
import type { ProjectsView } from '@renderer/modules/projects/composables/useProjects'

defineProps<{
  tabs: ProjectRuntimeInfo[]
  activeView: ProjectsView
}>()

const emit = defineEmits<{
  select: [view: ProjectsView]
  close: [folderName: string]
}>()
</script>

<template>
  <div class="tab-bar" role="tablist" aria-label="项目页签">
    <button
      type="button"
      class="tab-pill"
      role="tab"
      :aria-selected="activeView === 'home'"
      :data-active="activeView === 'home'"
      @click="emit('select', 'home')"
    >
      首页
    </button>

    <div
      v-for="tab in tabs"
      :key="tab.folderName"
      class="tab-pill tab-with-close"
      role="tab"
      :aria-selected="activeView === tab.folderName"
      :data-active="activeView === tab.folderName"
      @click="emit('select', tab.folderName)"
    >
      <span class="tab-label">{{ tab.displayName }}</span>
      <button
        type="button"
        class="tab-close"
        title="关闭"
        aria-label="关闭页签"
        @click.stop="emit('close', tab.folderName)"
      >
        <X class="h-3 w-3" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.tab-bar {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  border-bottom: 1px solid var(--border);
  padding: 10px 14px 8px;
}

.tab-pill {
  display: inline-flex;
  max-width: 160px;
  min-height: 30px;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--muted-foreground);
  padding: 4px 14px;
  font-size: 12px;
  white-space: nowrap;
  user-select: none;
  outline: none;
}

.tab-pill:focus-visible {
  box-shadow: 0 0 0 2px color-mix(in oklab, var(--ring) 45%, transparent);
}

.tab-pill:hover {
  color: var(--foreground);
  background: color-mix(in oklab, var(--muted) 50%, transparent);
}

.tab-pill[data-active='true'] {
  border-color: color-mix(in oklab, var(--primary) 45%, var(--border));
  background: color-mix(in oklab, var(--primary) 14%, transparent);
  color: var(--foreground);
}

.tab-with-close {
  padding-right: 6px;
}

.tab-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-close {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  padding: 2px;
  opacity: 0.65;
}

.tab-close:hover {
  background: color-mix(in oklab, var(--foreground) 12%, transparent);
  opacity: 1;
}
</style>
