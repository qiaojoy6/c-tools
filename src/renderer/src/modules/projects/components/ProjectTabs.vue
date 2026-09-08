<script setup lang="ts">
import { Plus, X } from 'lucide-vue-next'
import type { ProjectTab, ProjectsView } from '@renderer/modules/projects/composables/useProjects'
import ProjectIcon from './ProjectIcon.vue'

defineProps<{
  tabs: ProjectTab[]
  activeView: ProjectsView
}>()

const emit = defineEmits<{
  select: [view: ProjectsView]
  close: [tabId: string]
  add: []
}>()
</script>

<template>
  <div class="tab-bar" role="tablist" aria-label="项目页签">
    <div class="tab-scroll">
      <button
        type="button"
        class="tab"
        role="tab"
        :aria-selected="activeView === 'home'"
        :data-active="activeView === 'home'"
        title="首页"
        @click="emit('select', 'home')"
      >
        <span class="tab-label">首页</span>
      </button>

      <div
        v-for="tab in tabs"
        :key="tab.id"
        class="tab tab-with-close"
        role="tab"
        :aria-selected="activeView === tab.id"
        :data-active="activeView === tab.id"
        :title="tab.displayName"
        tabindex="0"
        @click="emit('select', tab.id)"
        @keydown.enter.prevent="emit('select', tab.id)"
        @keydown.space.prevent="emit('select', tab.id)"
      >
        <ProjectIcon class="tab-icon" :icon-url="tab.iconUrl" :name="tab.displayName" :size="14" />
        <span class="tab-label">{{ tab.displayName }}</span>
        <button
          type="button"
          class="tab-close"
          title="关闭"
          aria-label="关闭页签"
          @click.stop="emit('close', tab.id)"
        >
          <X class="h-3 w-3" />
        </button>
      </div>
    </div>

    <button
      type="button"
      class="tab-add"
      title="新标签页"
      aria-label="新标签页"
      @click="emit('add')"
    >
      <Plus class="h-3.5 w-3.5" />
    </button>
  </div>
</template>

<style scoped>
/* 浏览器式页签：灰底栏 + 激活白底上圆角 + 底部凹肩；先压缩到 min，再横向滚动 */
.tab-bar {
  --tab-radius: 10px;
  --tab-curve: 10px;
  --tab-active-bg: var(--background);
  display: flex;
  flex-shrink: 0;
  align-items: flex-end;
  gap: 2px;
  overflow: hidden;
  border-bottom: 1px solid var(--border);
  background: color-mix(in oklab, var(--muted) 88%, var(--background));
  padding: 6px 6px 0 10px;
  min-height: 38px;
  min-width: 0;
  width: 100%;
}

/* 页签横向区：可压缩滚动；「+」固定在右侧不挤进滚动 */
.tab-scroll {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: flex-end;
  overflow-x: auto;
  overflow-y: hidden;
}

.tab {
  position: relative;
  z-index: 0;
  display: inline-flex;
  /* 均分可用宽度；少时不超过 max，多时压到 min；再多则溢出由栏滚动 */
  flex: 1 1 0;
  width: 0;
  min-width: 72px;
  max-width: 168px;
  min-height: 32px;
  margin: 0 1px -1px;
  cursor: pointer;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  border: none;
  border-radius: var(--tab-radius) var(--tab-radius) 0 0;
  background: transparent;
  color: var(--muted-foreground);
  padding: 0 12px;
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  user-select: none;
  outline: none;
  box-sizing: border-box;
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
  padding-right: 6px;
}

.tab-icon {
  flex-shrink: 0;
}

.tab-label {
  min-width: 0;
  flex: 1 1 auto;
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

.tab-add {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin: 0 4px 3px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--muted-foreground);
  cursor: pointer;
  outline: none;
}

.tab-add:hover {
  color: var(--foreground);
  background: color-mix(in oklab, var(--foreground) 8%, transparent);
}

.tab-add:focus-visible {
  box-shadow: inset 0 0 0 2px color-mix(in oklab, var(--ring) 40%, transparent);
}
</style>
