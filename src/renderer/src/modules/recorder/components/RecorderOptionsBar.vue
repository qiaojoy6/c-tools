<script setup lang="ts">
import type { RecorderVideoQuality } from '@shared/types'
import { computed, useSlots } from 'vue'
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-vue-next'
import { Button } from '@renderer/components/ui/button'
import { Select, type SelectOption } from '@renderer/components/ui/select'
import { Separator } from '@renderer/components/ui/separator'

/** 清晰度三档：流畅 / 超清 / 原画（区域与全屏共用） */
const QUALITY_OPTIONS: SelectOption[] = [
  { value: 'smooth', label: '流畅' },
  { value: 'ultra', label: '超清' },
  { value: 'original', label: '原画' }
]

const enableMic = defineModel<boolean>('enableMic', { required: true })
const enableSystemAudio = defineModel<boolean>('enableSystemAudio', { required: true })
const quality = defineModel<RecorderVideoQuality>('quality', { required: true })
const micDeviceId = defineModel<string>('micDeviceId', { required: true })

const props = defineProps<{
  /** 开始录制中等忙碌态 */
  disabled?: boolean
  /** Rust listMics 结果，供设备下拉 */
  micOptions?: SelectOption[]
}>()

const slots = useSlots()

const micSelectOptions = computed(() => props.micOptions ?? [])
const showMicSelect = computed(() => micSelectOptions.value.length > 0)
</script>

<template>
  <div class="rob" :class="{ 'has-actions': !!slots.actions }" aria-label="录制选项">
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      :class="
        enableSystemAudio
          ? 'bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700'
          : 'bg-muted text-muted-foreground hover:bg-muted/80'
      "
      :aria-pressed="enableSystemAudio"
      :title="enableSystemAudio ? '系统声音：开' : '系统声音：关'"
      :aria-label="enableSystemAudio ? '关闭系统声音' : '开启系统声音'"
      :disabled="disabled"
      @click="enableSystemAudio = !enableSystemAudio"
    >
      <Volume2 v-if="enableSystemAudio" class="size-4" />
      <VolumeX v-else class="size-4" />
    </Button>
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      :class="
        enableMic
          ? 'bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700'
          : 'bg-muted text-muted-foreground hover:bg-muted/80'
      "
      :aria-pressed="enableMic"
      :title="enableMic ? '麦克风：开' : '麦克风：关'"
      :aria-label="enableMic ? '关闭麦克风' : '开启麦克风'"
      :disabled="disabled"
      @click="enableMic = !enableMic"
    >
      <Mic v-if="enableMic" class="size-4" />
      <MicOff v-else class="size-4" />
    </Button>

    <div
      v-if="showMicSelect"
      class="rob-mic"
      :class="{ 'is-off': !enableMic }"
      title="麦克风设备"
    >
      <Select
        v-model="micDeviceId"
        :options="micSelectOptions"
        placeholder="麦克风"
        trigger-class="rob-mic-trigger h-8 max-w-[9.5rem] border-0 bg-transparent px-2 shadow-none focus-visible:ring-0"
        content-class="z-[100]"
      />
    </div>

    <div class="rob-quality" title="清晰度">
      <span class="rob-quality-label">清晰度</span>
      <Select
        v-model="quality"
        :options="QUALITY_OPTIONS"
        placeholder="清晰度"
        trigger-class="rob-quality-trigger h-8 w-[4.75rem] border-0 bg-transparent px-2 shadow-none focus-visible:ring-0"
        content-class="z-[100]"
      />
    </div>

    <template v-if="slots.actions">
      <Separator orientation="vertical" class="mx-1 h-4" />
      <slot name="actions" />
    </template>
  </div>
</template>

<style scoped>
.rob {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--foreground);
  box-shadow: 0 10px 28px -12px rgb(15 23 42 / 35%);
}
.rob-mic {
  display: inline-flex;
  align-items: center;
  height: 32px;
  max-width: 9.5rem;
  padding: 0 2px;
  border-radius: var(--radius-md);
  background: var(--muted);
  color: var(--muted-foreground);
  font-size: 12px;
  font-weight: 600;
}
.rob-mic.is-off {
  opacity: 0.55;
}
.rob-mic :deep(.rob-mic-trigger) {
  color: var(--foreground);
  font-size: 12px;
  font-weight: 650;
}
.rob-quality {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 2px 0 8px;
  border-radius: var(--radius-md);
  background: var(--muted);
  color: var(--muted-foreground);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
/* 无尾部操作时清晰度靠右（全屏弹窗） */
.rob:not(.has-actions) .rob-quality {
  margin-left: auto;
}
.rob-quality-label {
  flex-shrink: 0;
}
.rob-quality :deep(.rob-quality-trigger) {
  color: var(--foreground);
  font-size: 12px;
  font-weight: 700;
}
</style>
