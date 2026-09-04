<script setup lang="ts">
import type { AppConfig, ConfigPatch } from '@shared/types'
import { Switch } from '@renderer/components/ui/switch'

defineProps<{
  config: AppConfig
}>()

const emit = defineEmits<{
  (e: 'apply', patch: ConfigPatch): void
}>()
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
  </div>
</template>
