<script setup lang="ts">
import type { AppConfig, ConfigPatch } from '@shared/types'
import { DEFAULT_TOGGLE_PANEL_SHORTCUT } from '@shared/config'
import { computed, ref, watch } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Select, type SelectOption } from '@renderer/components/ui/select'
import { Separator } from '@renderer/components/ui/separator'
import { Switch } from '@renderer/components/ui/switch'
import HotkeyInput from './HotkeyInput.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'toast', message: string): void
}>()

const config = ref<AppConfig | null>(null)

const isDefaultShortcut = computed(
  () => config.value?.shortcuts.togglePanel === DEFAULT_TOGGLE_PANEL_SHORTCUT
)

watch(
  () => props.open,
  async (open) => {
    if (open) {
      config.value = await window.api.getConfig()
      return
    }
    // 关闭设置时若仍在录制，恢复全局快捷键
    await window.api.resumeShortcuts()
  }
)

async function apply(patch: ConfigPatch): Promise<void> {
  const result = await window.api.updateConfig(patch)
  config.value = result.config
  for (const warning of result.warnings) {
    emit('toast', warning)
  }
}

function restoreDefaultShortcut(): void {
  if (isDefaultShortcut.value) return
  void apply({ shortcuts: { togglePanel: DEFAULT_TOGGLE_PANEL_SHORTCUT } })
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
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-w-md gap-0 p-0">
      <DialogHeader class="px-6 pt-6 pb-4">
        <DialogTitle>设置</DialogTitle>
        <DialogDescription>快捷键、记录与隐私，修改即时生效</DialogDescription>
      </DialogHeader>

      <div v-if="config" class="max-h-[60vh] space-y-5 overflow-y-auto px-6 pb-6">
        <!-- 快捷键 -->
        <section class="space-y-3">
          <h3 class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            快捷键
          </h3>
          <div class="flex items-center justify-between gap-4">
            <div class="min-w-0">
              <p class="text-sm">呼出 / 隐藏面板</p>
              <p class="mt-0.5 text-xs text-muted-foreground">点击右侧录制新的组合键</p>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <HotkeyInput
                :model-value="config.shortcuts.togglePanel"
                @update:model-value="(v) => apply({ shortcuts: { togglePanel: v } })"
              />
              <Button
                variant="ghost"
                size="sm"
                class="text-muted-foreground"
                :disabled="isDefaultShortcut"
                @click="restoreDefaultShortcut"
              >
                恢复默认
              </Button>
            </div>
          </div>
        </section>

        <Separator />

        <!-- 记录 -->
        <section class="space-y-3">
          <h3 class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            记录
          </h3>
          <div class="flex items-center justify-between gap-4">
            <p class="text-sm">最大保存条数</p>
            <Select
              class="w-32"
              trigger-class="w-32"
              :options="maxOptions"
              :model-value="config.clipboard.maxRecords"
              @update:model-value="(v) => apply({ clipboard: { maxRecords: Number(v) } })"
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
              @update:model-value="(v) => apply({ clipboard: { autoCleanDays: Number(v) } })"
            />
          </div>
        </section>

        <Separator />

        <!-- 隐私 -->
        <section class="space-y-3">
          <h3 class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            隐私
          </h3>
          <div class="flex items-center justify-between gap-4">
            <p class="text-sm">退出时清空全部记录</p>
            <Switch
              :model-value="config.privacy.clearOnQuit"
              @update:model-value="(v) => apply({ privacy: { clearOnQuit: v } })"
            />
          </div>
          <div class="flex items-center justify-between gap-4">
            <p class="text-sm">启动时清空历史记录</p>
            <Switch
              :model-value="config.privacy.clearOnStart"
              @update:model-value="(v) => apply({ privacy: { clearOnStart: v } })"
            />
          </div>
        </section>

        <Separator />

        <!-- 通用 -->
        <section class="space-y-3">
          <h3 class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            通用
          </h3>
          <div class="flex items-center justify-between gap-4">
            <div>
              <p class="text-sm">开机自动启动</p>
              <p class="mt-0.5 text-xs text-muted-foreground">登录时在后台静默运行</p>
            </div>
            <Switch
              :model-value="config.general.launchAtLogin"
              @update:model-value="(v) => apply({ general: { launchAtLogin: v } })"
            />
          </div>
        </section>
      </div>
    </DialogContent>
  </Dialog>
</template>
