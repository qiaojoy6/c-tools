<script setup lang="ts">
import type { AppConfig, ConfigPatch } from '@shared/types'
import { defaultShortcut } from '@shared/shortcuts'
import { computed } from 'vue'
import { Button } from '@renderer/components/ui/button'
import HotkeyInput from './HotkeyInput.vue'

const props = defineProps<{
  config: AppConfig
}>()

const emit = defineEmits<{
  (e: 'apply', patch: ConfigPatch): void
}>()

const defaultRegion = defaultShortcut('recorderRegion')
const defaultFullscreen = defaultShortcut('recorderFullscreen')
const defaultPauseResume = defaultShortcut('recorderPauseResume')
const defaultStop = defaultShortcut('recorderStop')

const isDefaultRegion = computed(() => props.config.shortcuts.recorderRegion === defaultRegion)
const isDefaultFullscreen = computed(
  () => props.config.shortcuts.recorderFullscreen === defaultFullscreen
)
const isDefaultPauseResume = computed(
  () => props.config.shortcuts.recorderPauseResume === defaultPauseResume
)
const isDefaultStop = computed(() => props.config.shortcuts.recorderStop === defaultStop)

function restoreRegion(): void {
  if (isDefaultRegion.value) return
  emit('apply', { shortcuts: { recorderRegion: defaultRegion } })
}

function restoreFullscreen(): void {
  if (isDefaultFullscreen.value) return
  emit('apply', { shortcuts: { recorderFullscreen: defaultFullscreen } })
}

function restorePauseResume(): void {
  if (isDefaultPauseResume.value) return
  emit('apply', { shortcuts: { recorderPauseResume: defaultPauseResume } })
}

function restoreStop(): void {
  if (isDefaultStop.value) return
  emit('apply', { shortcuts: { recorderStop: defaultStop } })
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

      <div class="flex items-center justify-between gap-4">
        <div class="min-w-0">
          <p class="text-sm">暂停 / 继续</p>
          <p class="mt-0.5 text-xs text-muted-foreground">
            录制中切换暂停与继续；空闲时无效；可清空关闭
          </p>
        </div>
        <div class="flex shrink-0 flex-col items-end gap-1.5">
          <HotkeyInput
            :model-value="config.shortcuts.recorderPauseResume"
            @update:model-value="(v) => emit('apply', { shortcuts: { recorderPauseResume: v } })"
          />
          <Button
            variant="ghost"
            size="sm"
            class="h-7 text-xs text-muted-foreground"
            :disabled="isDefaultPauseResume"
            @click="restorePauseResume"
          >
            恢复默认
          </Button>
        </div>
      </div>

      <div class="flex items-center justify-between gap-4">
        <div class="min-w-0">
          <p class="text-sm">停止录屏</p>
          <p class="mt-0.5 text-xs text-muted-foreground">
            停止当前录制并弹出保存；空闲时无效；可清空关闭
          </p>
        </div>
        <div class="flex shrink-0 flex-col items-end gap-1.5">
          <HotkeyInput
            :model-value="config.shortcuts.recorderStop"
            @update:model-value="(v) => emit('apply', { shortcuts: { recorderStop: v } })"
          />
          <Button
            variant="ghost"
            size="sm"
            class="h-7 text-xs text-muted-foreground"
            :disabled="isDefaultStop"
            @click="restoreStop"
          >
            恢复默认
          </Button>
        </div>
      </div>
    </section>
  </div>
</template>
