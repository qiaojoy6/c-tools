<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Button } from '@renderer/components/ui/button'
import { Keyboard, X } from 'lucide-vue-next'
import { cn } from '@renderer/lib/utils'

const props = defineProps<{
  modelValue: string
  buttonClass?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const isMac = navigator.userAgent.includes('Mac')
const recording = ref(false)

const MAC_SYMBOLS: Record<string, string> = {
  CommandOrControl: '⌘',
  Command: '⌘',
  Control: '⌃',
  Ctrl: '⌃',
  Meta: '⌘',
  Alt: '⌥',
  Option: '⌥',
  Shift: '⇧',
  Space: '空格',
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
  Enter: '↩',
  Backspace: '⌫',
  Delete: '⌦',
  Tab: '⇥',
  Esc: '⎋'
}

const WIN_LABELS: Record<string, string> = {
  CommandOrControl: 'Ctrl',
  Command: 'Win',
  Control: 'Ctrl',
  Ctrl: 'Ctrl',
  Meta: 'Win',
  Alt: 'Alt',
  Option: 'Alt',
  Shift: 'Shift',
  Space: 'Space',
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→'
}

const display = computed(() => pretty(props.modelValue))
const canClear = computed(() => Boolean(props.modelValue) && !recording.value)

function pretty(accelerator: string): string {
  if (!accelerator) return ''
  const map = isMac ? MAC_SYMBOLS : WIN_LABELS
  return accelerator
    .split('+')
    .map((p) => map[p] ?? p)
    .join(isMac ? ' ' : ' + ')
}

/** 用 e.code 映射物理键，避免 macOS Option 改写 e.key */
function keyToAccelerator(e: KeyboardEvent): string | null {
  if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return null

  const parts: string[] = []
  if (isMac) {
    if (e.metaKey) parts.push('Command')
    if (e.ctrlKey) parts.push('Control')
  } else {
    if (e.ctrlKey) parts.push('Ctrl')
    if (e.metaKey) parts.push('Meta')
  }
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')

  const code = e.code
  let keyName = ''
  // Space：部分环境 e.key 为字面量空格，必须写成 Electron 的 "Space"
  if (code === 'Space' || e.key === ' ' || e.key === 'Spacebar') {
    keyName = 'Space'
  } else if (/^Key[A-Z]$/.test(code)) {
    keyName = code.slice(3)
  } else if (/^Digit[0-9]$/.test(code)) {
    keyName = code.slice(5)
  } else if (/^F\d{1,2}$/.test(code)) {
    keyName = code
  } else if (code.startsWith('Arrow')) {
    keyName = code.slice(5)
  } else if (
    ['Home', 'End', 'PageUp', 'PageDown', 'Insert', 'Delete', 'Backspace', 'Enter', 'Tab'].includes(
      e.key
    )
  ) {
    keyName = e.key
  } else {
    return null
  }

  if (!keyName || /\s/.test(keyName)) return null

  // 功能键可单独使用，其余必须带修饰键
  if (parts.length === 0 && !/^F\d{1,2}$/.test(keyName)) return null

  parts.push(keyName)
  return parts.join('+')
}

async function startRecording(): Promise<void> {
  if (recording.value) return
  recording.value = true
  await window.api.suspendShortcuts()
}

async function cancelRecording(): Promise<void> {
  if (!recording.value) return
  recording.value = false
  await window.api.resumeShortcuts()
}

async function commitRecording(accelerator: string): Promise<void> {
  if (!recording.value) return
  recording.value = false
  // 由父级 updateConfig 注册新快捷键，此处不再 resume 旧键
  emit('update:modelValue', accelerator)
}

/** 清空快捷键 = 关闭该全局快捷功能；录制中清空也不 resume 旧键 */
function clearShortcut(): void {
  if (recording.value) recording.value = false
  emit('update:modelValue', '')
}

function onKeydown(e: KeyboardEvent): void {
  if (!recording.value) return
  e.preventDefault()
  e.stopPropagation()
  if (e.key === 'Escape') {
    void cancelRecording()
    return
  }
  // 录制中单独按 Backspace / Delete → 清空
  if (
    (e.key === 'Backspace' || e.key === 'Delete') &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.altKey &&
    !e.shiftKey
  ) {
    clearShortcut()
    return
  }
  const accelerator = keyToAccelerator(e)
  if (!accelerator) return
  void commitRecording(accelerator)
}

onMounted(() => window.addEventListener('keydown', onKeydown, true))
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown, true)
  if (recording.value) void window.api.resumeShortcuts()
})
</script>

<template>
  <div class="flex items-center gap-1">
    <Button
      variant="outline"
      :class="cn('min-w-40 justify-start gap-2 font-normal', props.buttonClass)"
      @click="startRecording"
    >
      <Keyboard class="size-4 text-primary" />
      <span v-if="recording" class="animate-pulse text-primary">按下组合键…（Esc 取消）</span>
      <span v-else>{{ display || '未设置' }}</span>
    </Button>
    <Button
      v-if="canClear"
      type="button"
      variant="ghost"
      size="icon"
      class="size-9 shrink-0 text-muted-foreground"
      aria-label="清空快捷键"
      title="清空（关闭该快捷键）"
      @click="clearShortcut"
    >
      <X class="size-4" />
    </Button>
  </div>
</template>
