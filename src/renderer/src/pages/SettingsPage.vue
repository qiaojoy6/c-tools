<script setup lang="ts">
import type { AppConfig, ConfigPatch } from '@shared/types'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { SETTINGS_MODULES } from '@renderer/modules/settings/tabs'
import GeneralSettings from '@renderer/modules/settings/components/GeneralSettings.vue'
import ClipboardSettings from '@renderer/modules/settings/components/ClipboardSettings.vue'
import { cn } from '@renderer/lib/utils'

const config = ref<AppConfig | null>(null)
const activeModule = ref(SETTINGS_MODULES[0]!.id)
const toastMsg = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null
let offShown: (() => void) | null = null

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
})

onUnmounted(() => {
  offShown?.()
  if (toastTimer) clearTimeout(toastTimer)
  void window.api.resumeShortcuts()
})
</script>

<template>
  <div class="flex h-screen bg-background text-foreground">
    <!-- 左侧模块 Tab -->
    <aside class="flex w-48 shrink-0 flex-col border-r border-border/50 bg-card/30">
      <nav class="flex flex-1 flex-col gap-0.5 px-2 py-3">
        <button
          v-for="mod in SETTINGS_MODULES"
          :key="mod.id"
          type="button"
          :class="
            cn(
              'flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors',
              activeModule === mod.id
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
            )
          "
          @click="activeModule = mod.id"
        >
          <component :is="mod.icon" class="size-4 shrink-0" />
          <span>{{ mod.label }}</span>
        </button>
      </nav>
    </aside>

    <!-- 右侧内容 -->
    <main class="flex min-w-0 flex-1 flex-col">
      <header class="shrink-0 border-b border-border/50 px-6 py-4">
        <h2 class="text-base font-semibold">{{ activeTab.label }}</h2>
        <p class="mt-0.5 text-xs text-muted-foreground">{{ activeTab.description }}</p>
      </header>

      <div v-if="config" class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <GeneralSettings
          v-if="activeModule === 'general'"
          :config="config"
          @apply="apply"
        />
        <ClipboardSettings
          v-else-if="activeModule === 'clipboard'"
          :config="config"
          @apply="apply"
        />
      </div>
    </main>

    <Transition name="toast">
      <div v-if="toastMsg" class="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center">
        <div
          class="rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground shadow-lg"
        >
          {{ toastMsg }}
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
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
