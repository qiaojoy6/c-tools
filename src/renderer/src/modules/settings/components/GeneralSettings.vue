<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { AppConfig, ConfigPatch, UpdateStatus } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Switch } from '@renderer/components/ui/switch'

defineProps<{
  config: AppConfig
}>()

const emit = defineEmits<{
  (e: 'apply', patch: ConfigPatch): void
}>()

const update = ref<UpdateStatus | null>(null)
let offUpdate: (() => void) | null = null

const busy = computed(() => {
  const s = update.value?.state
  return s === 'checking' || s === 'downloading' || s === 'available'
})

const canInstall = computed(() => update.value?.state === 'downloaded')

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
</script>

<template>
  <div class="space-y-5">
    <section class="space-y-3">
      <h3 class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">启动</h3>
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
      <h3 class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">关于与更新</h3>
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <p class="text-sm">当前版本 {{ update?.currentVersion ?? '…' }}</p>
          <p class="mt-0.5 text-xs text-muted-foreground">
            {{ update?.message || (update?.canUpdate ? '启动后会自动检查更新' : '开发模式不检查更新') }}
          </p>
          <p
            v-if="update?.state === 'downloading' && update.percent != null"
            class="mt-1 text-xs text-muted-foreground"
          >
            进度 {{ update.percent }}%
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
          <Button v-if="canInstall" type="button" size="sm" @click="onInstall">
            重启安装
          </Button>
        </div>
      </div>
    </section>
  </div>
</template>
