<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { AppConfig, ConfigPatch, ToggleableFeatureId, UpdateStatus } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Switch } from '@renderer/components/ui/switch'
import { FEATURE_TOGGLE_OPTIONS } from '@renderer/modules/feature/toggles'
import { isFeatureEnabled } from '@renderer/modules/feature/enabled'
import { Monitor, Moon, Sun } from 'lucide-vue-next'
import SettingsSectionTitle from './SettingsSectionTitle.vue'

const props = defineProps<{
  config: AppConfig
}>()

const emit = defineEmits<{
  (e: 'apply', patch: ConfigPatch): void
}>()

const update = ref<UpdateStatus | null>(null)
let offUpdate: (() => void) | null = null

const themeOptions = [
  { value: 'light' as const, label: '浅色', icon: Sun },
  { value: 'dark' as const, label: '深色', icon: Moon },
  { value: 'system' as const, label: '跟随系统', icon: Monitor }
]

const busy = computed(() => {
  const s = update.value?.state
  return s === 'checking' || s === 'downloading'
})

const canInstall = computed(() => update.value?.state === 'downloaded')

/** mac：有新版本时引导去 GitHub */
const showGithubDownload = computed(
  () =>
    update.value?.manualDownload === true &&
    update.value.state === 'available' &&
    Boolean(update.value.availableVersion)
)

const clipboardOn = computed(() => isFeatureEnabled(props.config.features, 'clipboard'))

onMounted(() => {
  void window.api.getUpdateStatus().then((s) => {
    update.value = s
  })
  offUpdate = window.api.onUpdateStatus((s) => {
    update.value = s
  })
})

onUnmounted(() => {
  offUpdate?.()
  offUpdate = null
})

async function onCheck(): Promise<void> {
  update.value = await window.api.checkForUpdates()
}

async function onInstall(): Promise<void> {
  await window.api.installUpdate()
}

async function onOpenGithub(): Promise<void> {
  await window.api.openUpdateReleasePage()
}

function featureOn(id: ToggleableFeatureId): boolean {
  // 剪贴板关闭时截屏在主进程也会被跳过，开关显示为关且不可开
  if (id === 'screenshot' && !clipboardOn.value) return false
  return isFeatureEnabled(props.config.features, id)
}

function featureLocked(id: ToggleableFeatureId): boolean {
  return id === 'screenshot' && !clipboardOn.value
}

function onFeatureToggle(id: ToggleableFeatureId, enabled: boolean): void {
  if (featureLocked(id)) return
  let enabledPatch: Partial<Record<ToggleableFeatureId, boolean>> = { [id]: enabled }
  // 关剪贴板时同步关掉截屏开关位，避免配置看起来仍开着
  if (id === 'clipboard' && !enabled) {
    enabledPatch = { clipboard: false, screenshot: false }
  }
  emit('apply', {
    features: {
      enabled: enabledPatch
    }
  })
}
</script>

<template>
  <div class="space-y-6">
    <section class="space-y-3">
      <SettingsSectionTitle title="外观" />
      <div>
        <p class="text-sm">主题</p>
        <div class="theme-seg mt-3" role="radiogroup" aria-label="主题">
          <button
            v-for="opt in themeOptions"
            :key="opt.value"
            type="button"
            class="theme-seg-btn"
            role="radio"
            :aria-checked="config.general.theme === opt.value"
            :data-active="config.general.theme === opt.value"
            @click="emit('apply', { general: { theme: opt.value } })"
          >
            <component :is="opt.icon" class="theme-seg-icon" aria-hidden="true" />
            {{ opt.label }}
          </button>
        </div>
      </div>
    </section>

    <section class="space-y-3">
      <SettingsSectionTitle title="启动" />
      <div class="flex items-center justify-between gap-4">
        <div>
          <p class="text-sm">开机自动启动</p>
          <p class="mt-0.5 text-xs text-muted-foreground">登录时在后台静默运行</p>
        </div>
        <Switch
          :model-value="config.general.launchAtLogin"
          @update:model-value="(v) => emit('apply', { general: { launchAtLogin: v } })"
        />
      </div>
    </section>

    <section class="space-y-3">
      <SettingsSectionTitle
        title="功能模块"
        description="开关立即生效：侧栏、快捷键、托盘会同步；关闭会暂停剪贴板监听。首次开启某模块会自动加载"
      />
      <div
        v-for="opt in FEATURE_TOGGLE_OPTIONS"
        :key="opt.id"
        class="flex items-center justify-between gap-4"
      >
        <div class="min-w-0">
          <p class="text-sm">{{ opt.label }}</p>
          <p class="mt-0.5 text-xs text-muted-foreground">
            <template v-if="featureLocked(opt.id)">需先开启剪贴板</template>
            <template v-else>{{ opt.description }}</template>
          </p>
        </div>
        <Switch
          :model-value="featureOn(opt.id)"
          :disabled="featureLocked(opt.id)"
          @update:model-value="(v) => onFeatureToggle(opt.id, v)"
        />
      </div>
    </section>

    <section class="space-y-3">
      <SettingsSectionTitle title="关于与更新" />
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <p class="text-sm">当前版本 {{ update?.currentVersion ?? '…' }}</p>
          <p class="mt-0.5 text-xs text-muted-foreground">
            {{ update?.message || (update?.canUpdate ? '启动后会自动检查更新' : '开发模式不检查更新') }}
          </p>
        </div>
        <div class="flex shrink-0 flex-col gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            :disabled="busy || update?.canUpdate === false"
            @click="onCheck"
          >
            检查更新
          </Button>
          <Button v-if="showGithubDownload" type="button" size="sm" @click="onOpenGithub">
            前往 GitHub 下载
          </Button>
          <Button v-if="canInstall" type="button" size="sm" @click="onInstall">
            重启安装
          </Button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.theme-seg {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  border-radius: 12px;
  border: 1px solid color-mix(in oklab, var(--border) 80%, transparent);
  background: color-mix(in oklab, var(--muted) 70%, transparent);
  padding: 4px;
}

.theme-seg-btn {
  display: inline-flex;
  height: 36px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 9px;
  font-size: 12px;
  font-weight: 500;
  color: var(--muted-foreground);
  transition:
    color 0.2s ease,
    background 0.2s ease,
    box-shadow 0.2s ease;
}

.theme-seg-btn:hover {
  color: var(--foreground);
  background: color-mix(in oklab, var(--foreground) 6%, transparent);
}

.theme-seg-btn[data-active='true'] {
  background: color-mix(in oklab, var(--primary) 22%, var(--card));
  color: var(--foreground);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--primary) 35%, transparent);
}

.theme-seg-btn[data-active='true']:hover {
  color: var(--foreground);
  background: color-mix(in oklab, var(--primary) 28%, var(--card));
}

.theme-seg-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}
</style>
