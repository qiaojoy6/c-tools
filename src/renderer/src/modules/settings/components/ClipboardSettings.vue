<script setup lang="ts">
import type { AppConfig, ConfigPatch } from '@shared/types'
import { DEFAULT_TOGGLE_PANEL_SHORTCUT } from '@shared/config'
import { computed } from 'vue'
import { Button } from '@renderer/components/ui/button'
import { Select, type SelectOption } from '@renderer/components/ui/select'
import { Switch } from '@renderer/components/ui/switch'
import { Separator } from '@renderer/components/ui/separator'
import HotkeyInput from './HotkeyInput.vue'

const props = defineProps<{
  config: AppConfig
}>()

const emit = defineEmits<{
  (e: 'apply', patch: ConfigPatch): void
}>()

const isDefaultShortcut = computed(
  () => props.config.shortcuts.togglePanel === DEFAULT_TOGGLE_PANEL_SHORTCUT
)

function restoreDefaultShortcut(): void {
  if (isDefaultShortcut.value) return
  emit('apply', { shortcuts: { togglePanel: DEFAULT_TOGGLE_PANEL_SHORTCUT } })
}

const maxOptions: SelectOption[] = [50, 100, 150, 200].map((v) => ({ label: `${v} 条`, value: v }))
const cleanOptions: SelectOption[] = [
  { label: '永不清理', value: 0 },
  { label: '7 天', value: 7 },
  { label: '15 天', value: 15 },
  { label: '30 天', value: 30 }
]
</script>

<template>
  <div class="space-y-5">
    <section class="space-y-3">
      <h3 class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">全局快捷键</h3>
      <div class="flex items-center justify-between gap-4">
        <div class="min-w-0">
          <p class="text-sm">呼出剪贴板</p>
          <p class="mt-0.5 text-xs text-muted-foreground">呼出 / 隐藏独立剪贴板窗口；可清空关闭</p>
        </div>
        <div class="flex shrink-0 flex-col items-end gap-1.5">
          <HotkeyInput
            :model-value="config.shortcuts.togglePanel"
            @update:model-value="(v) => emit('apply', { shortcuts: { togglePanel: v } })"
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
      <h3 class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">记录</h3>
      <div class="flex items-center justify-between gap-4">
        <p class="text-sm">最大保存条数</p>
        <Select
          class="w-32"
          trigger-class="w-32"
          :options="maxOptions"
          :model-value="config.clipboard.maxRecords"
          @update:model-value="(v) => emit('apply', { clipboard: { maxRecords: Number(v) } })"
        />
      </div>
      <div class="flex items-center justify-between gap-4">
        <div>
          <p class="text-sm">自动清理过期记录</p>
          <p class="mt-0.5 text-xs text-muted-foreground">超期的剪贴记录将被自动删除</p>
        </div>
        <Select
          trigger-class="w-32"
          :options="cleanOptions"
          :model-value="config.clipboard.autoCleanDays"
          @update:model-value="(v) => emit('apply', { clipboard: { autoCleanDays: Number(v) } })"
        />
      </div>
    </section>

    <Separator />

    <section class="space-y-3">
      <h3 class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">隐私</h3>
      <div class="flex items-center justify-between gap-4">
        <p class="text-sm">退出时清空全部记录</p>
        <Switch
          :model-value="config.privacy.clearOnQuit"
          @update:model-value="(v) => emit('apply', { privacy: { clearOnQuit: v } })"
        />
      </div>
      <div class="flex items-center justify-between gap-4">
        <p class="text-sm">启动时清空历史记录</p>
        <Switch
          :model-value="config.privacy.clearOnStart"
          @update:model-value="(v) => emit('apply', { privacy: { clearOnStart: v } })"
        />
      </div>
    </section>
  </div>
</template>
