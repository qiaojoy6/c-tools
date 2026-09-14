<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Settings2 } from 'lucide-vue-next'
import { PANEL_MODULES } from '@renderer/modules/panel/tabs'
import WindowTitleBar from '@renderer/modules/panel/components/WindowTitleBar.vue'
import ClipboardPage from '@renderer/pages/ClipboardPage.vue'
import QuickFoldersPage from '@renderer/pages/QuickFoldersPage.vue'
import ProjectsPage from '@renderer/pages/ProjectsPage.vue'

/** 功能面板：通栏自定义表头 + 左侧模块轨 + 内容区 */
const activeModule = ref(PANEL_MODULES[0]!.id)
/** 首次进入后再挂载，之后用 v-show 保留 webview */
const projectsMounted = ref(false)

const showClipboard = computed(() => activeModule.value === 'clipboard')
const showQuickFolders = computed(() => activeModule.value === 'quickFolders')
const showProjects = computed(() => activeModule.value === 'projects')

watch(activeModule, (id) => {
  if (id === 'projects') projectsMounted.value = true
})

let offPanelShown: (() => void) | null = null

onMounted(() => {
  document.title = '功能面板'
  // 唤醒/show 后去掉自动聚焦，避免第一个按钮残留「选中」外观
  offPanelShown = window.api.onPanelShown(() => {
    // focus() 后 Chromium 异步落到首个可聚焦控件，延后 blur
    requestAnimationFrame(() => {
      const el = document.activeElement
      if (el instanceof HTMLElement && el !== document.body) el.blur()
    })
  })
})

onUnmounted(() => {
  offPanelShown?.()
  offPanelShown = null
})

function openSettings(): void {
  window.api.openSettings()
}
</script>

<template>
  <div class="panel">
    <WindowTitleBar />

    <div class="panel-main">
      <!-- 左侧图标轨道 -->
      <aside class="rail">
        <nav class="rail-nav" aria-label="功能模块">
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
          class="rail-btn rail-settings"
          title="设置"
          aria-label="打开设置"
          @click="openSettings"
        >
          <Settings2 class="rail-icon" aria-hidden="true" />
        </button>
      </aside>

      <div class="panel-body">
        <ClipboardPage v-if="showClipboard" />
        <QuickFoldersPage v-else-if="showQuickFolders" />
        <ProjectsPage v-if="projectsMounted" v-show="showProjects" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  height: 100vh;
  flex-direction: column;
  overflow: hidden;
}

.panel-main {
  display: flex;
  min-height: 0;
  flex: 1;
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
  background: color-mix(in oklab, var(--foreground) 10%, transparent);
  color: var(--foreground);
}

.rail-btn[aria-current='page'] {
  background: color-mix(in oklab, var(--primary) 18%, transparent);
  color: var(--primary);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--primary) 40%, transparent);
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
  position: relative;
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.panel-body > * {
  position: absolute;
  inset: 0;
  min-height: 0;
}
</style>
