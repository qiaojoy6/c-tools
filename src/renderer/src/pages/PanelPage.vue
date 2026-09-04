<script setup lang="ts">
import { ref } from 'vue'
import { Settings2 } from 'lucide-vue-next'
import { PANEL_MODULES } from '@renderer/modules/panel/tabs'
import ClipboardPage from '@renderer/pages/ClipboardPage.vue'

/** 功能面板：左侧模块轨 + 内容区（剪贴板也可经快捷键以 /clipboard 独立浮层打开） */
const activeModule = ref(PANEL_MODULES[0]!.id)

function openSettings(): void {
  window.api.openSettings()
}
</script>

<template>
  <div class="panel">
    <!-- 左侧图标轨道 -->
    <aside class="rail drag-region">
      <nav class="rail-nav no-drag" aria-label="功能模块">
        <button
          v-for="mod in PANEL_MODULES"
          :key="mod.id"
          type="button"
          class="rail-btn"
          :title="mod.label"
          :aria-label="mod.label"
          :aria-current="activeModule === mod.id ? 'page' : undefined"
          @click="activeModule = mod.id"
        >
          <span v-if="activeModule === mod.id" class="rail-indicator" aria-hidden="true" />
          <component :is="mod.icon" class="rail-icon" aria-hidden="true" />
        </button>
      </nav>

      <button
        type="button"
        class="rail-btn rail-settings no-drag"
        title="设置"
        aria-label="打开设置"
        @click="openSettings"
      >
        <Settings2 class="rail-icon" aria-hidden="true" />
      </button>
    </aside>

    <div class="panel-body">
      <ClipboardPage v-if="activeModule === 'clipboard'" />
    </div>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.rail {
  display: flex;
  width: 55px;
  flex-shrink: 0;
  flex-direction: column;
  align-items: center;
  border-right: 1px solid color-mix(in oklab, var(--border) 40%, transparent);
  background: color-mix(in oklab, var(--rail) 80%, transparent);
  padding: 12px 0;
}

.rail-nav {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
}

.rail-btn {
  position: relative;
  display: flex;
  width: 35px;
  height: 35px;
  cursor: pointer;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  color: var(--muted-foreground);
  transition:
    color 0.2s ease,
    background 0.2s ease,
    box-shadow 0.2s ease;
}

.rail-btn:hover {
  background: rgb(255 255 255 / 5%);
  color: var(--foreground);
}

.rail-btn[aria-current='page'] {
  background: color-mix(in oklab, var(--primary) 15%, transparent);
  color: var(--primary);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--primary) 35%, transparent);
}

.rail-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in oklab, var(--ring) 50%, transparent);
}

.rail-indicator {
  position: absolute;
  top: 50%;
  left: 0;
  width: 2px;
  height: 20px;
  transform: translateY(-50%);
  border-radius: 999px;
  background: var(--primary);
}

.rail-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.rail-settings {
  margin-bottom: 4px;
}

.panel-body {
  min-width: 0;
  flex: 1;
}

.drag-region {
  -webkit-app-region: drag;
}

.no-drag {
  -webkit-app-region: no-drag;
}
</style>
