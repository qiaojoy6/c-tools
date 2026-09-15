<script setup lang="ts">
import type { AppConfig, ConfigPatch } from '@shared/types'
import { defaultShortcut } from '@shared/shortcuts'
import { computed } from 'vue'
import { Button } from '@renderer/components/ui/button'
import { Select, type SelectOption } from '@renderer/components/ui/select'
import { Separator } from '@renderer/components/ui/separator'
import HotkeyInput from './HotkeyInput.vue'
import SettingsSectionTitle from './SettingsSectionTitle.vue'

const props = defineProps<{
  config: AppConfig
}>()

const emit = defineEmits<{
  (e: 'apply', patch: ConfigPatch): void
}>()

const defaultToggle = defaultShortcut('toggleQuickFolders')

const isDefaultShortcut = computed(
  () => props.config.shortcuts.toggleQuickFolders === defaultToggle
)

function restoreDefaultShortcut(): void {
  if (isDefaultShortcut.value) return
  emit('apply', { shortcuts: { toggleQuickFolders: defaultToggle } })
}

const maxOptions: SelectOption[] = [20, 50, 100, 200].map((v) => ({
  label: `${v} 条`,
  value: v
}))
</script>

<template>
  <div class="space-y-6">
    <section class="space-y-3">
      <SettingsSectionTitle title="全局快捷键" />
      <div class="flex items-center justify-between gap-4">
        <div class="min-w-0">
          <p class="text-sm">呼出快捷文件夹</p>
          <p class="mt-0.5 text-xs text-muted-foreground">呼出 / 隐藏独立浮层；可清空关闭</p>
        </div>
        <div class="flex shrink-0 flex-col items-end gap-1.5">
          <HotkeyInput
            :model-value="config.shortcuts.toggleQuickFolders"
            @update:model-value="(v) => emit('apply', { shortcuts: { toggleQuickFolders: v } })"
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
      <SettingsSectionTitle title="列表" />
      <div class="flex items-center justify-between gap-4">
        <div>
          <p class="text-sm">最大保存条数</p>
          <p class="mt-0.5 text-xs text-muted-foreground">超出后拒绝继续添加</p>
        </div>
        <Select
          class="w-32"
          trigger-class="w-32"
          :options="maxOptions"
          :model-value="config.quickFolders.maxItems"
          @update:model-value="(v) => emit('apply', { quickFolders: { maxItems: Number(v) } })"
        />
      </div>
    </section>
  </div>
</template>
