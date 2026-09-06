<script setup lang="ts">
import type { ProjectRuntimeInfo } from '@shared/types'
import { X } from 'lucide-vue-next'
import type { ProjectsView } from '@renderer/modules/projects/composables/useProjects'
import ProjectIcon from './ProjectIcon.vue'

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
      class="tab"
      role="tab"
      :aria-selected="activeView === 'home'"
      :data-active="activeView === 'home'"
      @click="emit('select', 'home')"
    >
      <span class="tab-label">首页</span>
    </button>

    <div
      v-for="tab in tabs"
      :key="tab.folderName"
      class="tab tab-with-close"
      role="tab"
      :aria-selected="activeView === tab.folderName"
      :data-active="activeView === tab.folderName"
      tabindex="0"
      @click="emit('select', tab.folderName)"
      @keydown.enter.prevent="emit('select', tab.folderName)"
      @keydown.space.prevent="emit('select', tab.folderName)"
    >
      <ProjectIcon :icon-url="tab.iconUrl" :name="tab.displayName" :size="14" />
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
/* 浏览器式页签：灰底栏 + 激活白底上圆角 + 底部凹肩 */
.tab-bar {
  --tab-radius: 10px;
  --tab-curve: 10px;
  --tab-active-bg: var(--background);
  display: flex;
  flex-shrink: 0;
  align-items: flex-end;
  gap: 0;
  overflow-x: auto;
  border-bottom: 1px solid var(--border);
  background: color-mix(in oklab, var(--muted) 88%, var(--background));
  padding: 6px 10px 0;
  min-height: 38px;
}

.tab {
  position: relative;
  z-index: 0;
  display: inline-flex;
  max-width: 168px;
  min-height: 32px;
  margin: 0 1px -1px;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: none;
  border-radius: var(--tab-radius) var(--tab-radius) 0 0;
  background: transparent;
  color: var(--muted-foreground);
  padding: 0 14px;
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  user-select: none;
  outline: none;
}

/* 非激活页签之间的细竖分隔线；贴着激活页签时隐藏 */
.tab:not([data-active='true']) + .tab:not([data-active='true'])::before {
  content: '';
  position: absolute;
  top: 25%;
  left: -1px;
  width: 1px;
  height: 50%;
  background: color-mix(in oklab, var(--border) 85%, transparent);
}

.tab:focus-visible {
  color: var(--foreground);
  box-shadow: inset 0 0 0 2px color-mix(in oklab, var(--ring) 40%, transparent);
}

.tab:hover:not([data-active='true']) {
  color: var(--foreground);
  background: color-mix(in oklab, var(--foreground) 6%, transparent);
}

.tab[data-active='true'] {
  z-index: 1;
  background: var(--tab-active-bg);
  color: var(--foreground);
}

/* 激活页签底部左右凹肩（贴合栏底） */
.tab[data-active='true']::before,
.tab[data-active='true']::after {
  content: '';
  position: absolute;
  bottom: 0;
  width: var(--tab-curve);
  height: var(--tab-curve);
  background: transparent;
  pointer-events: none;
}

.tab[data-active='true']::before {
  left: calc(var(--tab-curve) * -1);
  border-bottom-right-radius: var(--tab-curve);
  box-shadow: 3px 3px 0 var(--tab-active-bg);
}

.tab[data-active='true']::after {
  right: calc(var(--tab-curve) * -1);
  border-bottom-left-radius: var(--tab-curve);
  box-shadow: -3px 3px 0 var(--tab-active-bg);
}

.tab-with-close {
  padding-right: 8px;
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
  border-radius: 4px;
  background: transparent;
  color: inherit;
  padding: 2px;
  opacity: 0.55;
}

.tab-close:hover {
  background: color-mix(in oklab, var(--foreground) 12%, transparent);
  opacity: 1;
}
</style>
