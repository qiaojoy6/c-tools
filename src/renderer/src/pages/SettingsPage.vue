<script setup lang="ts">
import type { AppConfig, ConfigPatch } from '@shared/types'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { SETTINGS_MODULES } from '@renderer/modules/settings/tabs'
import GeneralSettings from '@renderer/modules/settings/components/GeneralSettings.vue'
import ClipboardSettings from '@renderer/modules/settings/components/ClipboardSettings.vue'

const config = ref<AppConfig | null>(null)
const activeModule = ref(SETTINGS_MODULES[0]!.id)
const toastMsg = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null
let offShown: (() => void) | null = null
let offConfig: (() => void) | null = null

const activeTab = computed(
  () => SETTINGS_MODULES.find((m) => m.id === activeModule.value) ?? SETTINGS_MODULES[0]!
)

async function loadConfig(): Promise<void> {
  config.value = await window.api.getConfig()
}

async function apply(patch: ConfigPatch): Promise<void> {
  const result = await window.api.updateConfig(patch)
  config.value = result.config
  for (const warning of result.warnings) {
    showToast(warning)
  }
}

function showToast(message: string): void {
  toastMsg.value = message
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toastMsg.value = ''), 1800)
}

onMounted(() => {
  document.title = '设置'
  void loadConfig()
  offShown = window.api.onSettingsShown(() => {
    void loadConfig()
  })
  // 托盘等改配置时立刻刷新，避免开关状态滞后
  offConfig = window.api.onConfigUpdated((cfg) => {
    config.value = cfg
  })
})

onUnmounted(() => {
  offShown?.()
  offConfig?.()
  if (toastTimer) clearTimeout(toastTimer)
  void window.api.resumeShortcuts()
})
</script>

<template>
  <div class="settings">
    <aside class="aside">
      <div class="aside-label-wrap">
        <p class="aside-label">设置</p>
      </div>
      <nav class="aside-nav" aria-label="设置模块">
        <button
          v-for="mod in SETTINGS_MODULES"
          :key="mod.id"
          type="button"
          class="aside-btn"
          :aria-current="activeModule === mod.id ? 'page' : undefined"
          @click="activeModule = mod.id"
        >
          <component :is="mod.icon" class="aside-icon" aria-hidden="true" />
          <span class="aside-btn-text">{{ mod.label }}</span>
        </button>
      </nav>
    </aside>

    <main class="main">
      <header class="main-header">
        <h2 class="main-title">{{ activeTab.label }}</h2>
        <p class="main-desc">{{ activeTab.description }}</p>
      </header>

      <div v-if="config" class="main-body">
        <GeneralSettings v-if="activeModule === 'general'" :config="config" @apply="apply" />
        <ClipboardSettings
          v-else-if="activeModule === 'clipboard'"
          :config="config"
          @apply="apply"
        />
      </div>
    </main>

    <Transition name="toast">
      <div v-if="toastMsg" class="toast-wrap">
        <div class="toast">{{ toastMsg }}</div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.settings {
  display: flex;
  height: 100vh;
  background: var(--background);
  color: var(--foreground);
}

.aside {
  display: flex;
  width: 208px;
  flex-shrink: 0;
  flex-direction: column;
  border-right: 1px solid color-mix(in oklab, var(--border) 40%, transparent);
  background: color-mix(in oklab, var(--rail) 60%, transparent);
}

.aside-label-wrap {
  padding: 20px 16px 12px;
}

.aside-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted-foreground);
}

.aside-nav {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  padding: 0 10px 16px;
}

.aside-btn {
  display: flex;
  cursor: pointer;
  align-items: center;
  gap: 10px;
  border-radius: 12px;
  padding: 10px 12px;
  text-align: left;
  font-size: 14px;
  color: var(--muted-foreground);
  transition:
    color 0.2s ease,
    background 0.2s ease,
    box-shadow 0.2s ease;
}

.aside-btn:hover {
  background: color-mix(in oklab, var(--foreground) 10%, transparent);
  color: var(--foreground);
}

.aside-btn[aria-current='page'] {
  background: color-mix(in oklab, var(--primary) 18%, transparent);
  color: var(--primary);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--primary) 35%, transparent);
}

.aside-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.aside-btn-text {
  font-weight: 500;
}

.main {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}

.main-header {
  flex-shrink: 0;
  border-bottom: 1px solid color-mix(in oklab, var(--border) 40%, transparent);
  padding: 20px 28px;
}

.main-title {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.main-desc {
  margin-top: 4px;
  font-size: 14px;
  color: var(--muted-foreground);
}

.main-body {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 24px 28px;
}

.toast-wrap {
  pointer-events: none;
  position: fixed;
  inset-inline: 0;
  top: 16px;
  z-index: 50;
  display: flex;
  justify-content: center;
}

.toast {
  border-radius: 999px;
  background: var(--primary);
  padding: 6px 16px;
  font-size: 12px;
  font-weight: 500;
  color: var(--primary-foreground);
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / 20%);
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
