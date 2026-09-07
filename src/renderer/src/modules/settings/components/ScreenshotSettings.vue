<script setup lang="ts">
import type { AppConfig, ConfigPatch } from '@shared/types'
import { defaultScreenshotShortcut } from '@shared/modules/screenshot'
import { computed } from 'vue'
import { Button } from '@renderer/components/ui/button'
import { Switch } from '@renderer/components/ui/switch'
import { Separator } from '@renderer/components/ui/separator'
import HotkeyInput from './HotkeyInput.vue'

const props = defineProps<{
  config: AppConfig
}>()

const emit = defineEmits<{
  (e: 'apply', patch: ConfigPatch): void
}>()

const defaultShot = defaultScreenshotShortcut()

const isDefaultShortcut = computed(() => props.config.shortcuts.screenshot === defaultShot)

function restoreDefaultShortcut(): void {
  if (isDefaultShortcut.value) return
  emit('apply', { shortcuts: { screenshot: defaultShot } })
}
</script>

<template>
  <div class="space-y-5">
    <section class="space-y-3">
      <h3 class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">快捷键</h3>
      <div class="flex items-center justify-between gap-4">
        <div class="min-w-0">
          <p class="text-sm">截屏</p>
          <p class="mt-0.5 text-xs text-muted-foreground">
            全局快捷键，进入框选 / 点选窗口截屏
          </p>
        </div>
        <div class="flex shrink-0 flex-col items-end gap-1.5">
          <HotkeyInput
            :model-value="config.shortcuts.screenshot"
            @update:model-value="(v) => emit('apply', { shortcuts: { screenshot: v } })"
          />
          <Button
            variant="ghost"
            size="sm"
            class="h-7 text-xs text-muted-foreground"
            :disabled="isDefaultShortcut"
            @click="restoreDefaultShortcut"
          >
            恢复默认
          </Button>
        </div>
      </div>
    </section>

    <Separator />

    <section class="space-y-3">
      <h3 class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">行为</h3>
      <div class="flex items-center justify-between gap-4">
        <div class="min-w-0">
          <p class="text-sm">截屏时隐藏本应用窗口</p>
          <p class="mt-0.5 text-xs text-muted-foreground">
            避免截到剪贴板浮层、功能面板或设置窗
          </p>
        </div>
        <Switch
          :model-value="config.screenshot.hideAppWindows"
          @update:model-value="(v) => emit('apply', { screenshot: { hideAppWindows: v } })"
        />
      </div>
    </section>
  </div>
</template>
