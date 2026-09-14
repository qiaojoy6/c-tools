<script setup lang="ts">
import type { AppConfig, ConfigPatch } from '@shared/types'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { SETTINGS_MODULES } from '@renderer/modules/settings/tabs'
import { filterEnabledFeatures } from '@renderer/modules/feature/enabled'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider
} from '@renderer/components/ui/sidebar'

/** 设置窗固定侧栏宽度 */
const SETTINGS_SIDEBAR_WIDTH = '12rem'

const config = ref<AppConfig | null>(null)
const activeModule = ref(SETTINGS_MODULES[0]!.id)
const toastMsg = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null
let offShown: (() => void) | null = null
let offConfig: (() => void) | null = null

const visibleModules = computed(() =>
  filterEnabledFeatures(SETTINGS_MODULES, config.value?.features)
)

const activeTab = computed(
  () => visibleModules.value.find((m) => m.id === activeModule.value) ?? visibleModules.value[0]!
)

watch(visibleModules, (mods) => {
  if (!mods.length) return
  if (!mods.some((m) => m.id === activeModule.value)) {
    activeModule.value = mods[0]!.id
  }
})

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
    <!-- 设置侧栏始终展开：collapsible=none，关闭 ⌘B -->
    <SidebarProvider
      :default-open="true"
      :enable-shortcut="false"
      :sidebar-width="SETTINGS_SIDEBAR_WIDTH"
      class="min-h-0 flex-1"
    >
      <Sidebar collapsible="none" class="border-sidebar-border">
        <SidebarHeader>
          <SidebarGroupLabel class="px-2 text-[11px] font-semibold tracking-[0.08em] uppercase">
            设置
          </SidebarGroupLabel>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem v-for="mod in visibleModules" :key="mod.id">
                  <SidebarMenuButton
                    :is-active="activeModule === mod.id"
                    :aria-label="mod.label"
                    class="h-10"
                    @click="activeModule = mod.id"
                  >
                    <component :is="mod.icon" />
                    <span>{{ mod.label }}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      <SidebarInset class="min-h-0 overflow-hidden bg-transparent">
        <header class="main-header">
          <h2 class="main-title">{{ activeTab.label }}</h2>
          <p class="main-desc">{{ activeTab.description }}</p>
        </header>

        <div v-if="config" class="main-body">
          <!-- 设置内容来自可见 SETTINGS_MODULES；needsConfig 的注入 config，统一听 apply -->
          <template v-for="mod in visibleModules" :key="mod.id">
            <component
              :is="mod.component"
              v-if="activeModule === mod.id"
              v-bind="mod.needsConfig !== false ? { config } : {}"
              @apply="apply"
            />
          </template>
        </div>
      </SidebarInset>
    </SidebarProvider>

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
