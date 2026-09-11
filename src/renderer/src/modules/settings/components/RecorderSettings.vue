<script setup lang="ts">
import type { AppConfig, ConfigPatch } from '@shared/types'
import {
  defaultRecorderFullscreenShortcut,
  defaultRecorderRegionShortcut
} from '@shared/modules/recorder'
import { computed } from 'vue'
import { Button } from '@renderer/components/ui/button'
import HotkeyInput from './HotkeyInput.vue'

const props = defineProps<{
  config: AppConfig
}>()

const emit = defineEmits<{
  (e: 'apply', patch: ConfigPatch): void
}>()

const defaultRegion = defaultRecorderRegionShortcut()
const defaultFullscreen = defaultRecorderFullscreenShortcut()

const isDefaultRegion = computed(() => props.config.shortcuts.recorderRegion === defaultRegion)
const isDefaultFullscreen = computed(
  () => props.config.shortcuts.recorderFullscreen === defaultFullscreen
)

function restoreRegion(): void {
  if (isDefaultRegion.value) return
  emit('apply', { shortcuts: { recorderRegion: defaultRegion } })
}

function restoreFullscreen(): void {
  if (isDefaultFullscreen.value) return
  emit('apply', { shortcuts: { recorderFullscreen: defaultFullscreen } })
}
</script>

<template>
  <div class="space-y-5">
    <section class="space-y-3">
      <h3 class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        全局快捷键
      </h3>

      <div class="flex items-center justify-between gap-4">
        <div class="min-w-0">
          <p class="text-sm">区域录屏</p>
          <p class="mt-0.5 text-xs text-muted-foreground">
            进入框选 / 点选窗口录屏；框选中再按可取消；可清空关闭
          </p>
        </div>
        <div class="flex shrink-0 flex-col items-end gap-1.5">
          <HotkeyInput
            :model-value="config.shortcuts.recorderRegion"
            @update:model-value="(v) => emit('apply', { shortcuts: { recorderRegion: v } })"
          />
          <Button
            variant="ghost"
            size="sm"
            class="h-7 text-xs text-muted-foreground"
            :disabled="isDefaultRegion"
            @click="restoreRegion"
          >
            恢复默认
          </Button>
        </div>
      </div>

      <div class="flex items-center justify-between gap-4">
        <div class="min-w-0">
          <p class="text-sm">全屏录屏</p>
          <p class="mt-0.5 text-xs text-muted-foreground">弹出选屏 Dialog；可清空关闭</p>
        </div>
        <div class="flex shrink-0 flex-col items-end gap-1.5">
          <HotkeyInput
            :model-value="config.shortcuts.recorderFullscreen"
            @update:model-value="(v) => emit('apply', { shortcuts: { recorderFullscreen: v } })"
          />
          <Button
            variant="ghost"
            size="sm"
            class="h-7 text-xs text-muted-foreground"
            :disabled="isDefaultFullscreen"
            @click="restoreFullscreen"
          >
            恢复默认
          </Button>
        </div>
      </div>
    </section>
  </div>
</template>
