<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Keyboard } from 'lucide-vue-next'
import { cn } from '@/lib/utils'

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

function pretty(accelerator: string): string {
  if (!accelerator) return ''
  const map = isMac ? MAC_SYMBOLS : WIN_LABELS
  return accelerator
    .split('+')
    .map((p) => map[p] ?? p)
    .join(isMac ? ' ' : ' + ')
}

function keyToAccelerator(e: KeyboardEvent): string | null {
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

  const named: Record<string, string> = {
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    ' ': 'Space',
    Spacebar: 'Space'
  }

  let keyName = ''
  const k = e.key
  if (named[k]) {
    keyName = named[k]
  } else if (k.length === 1) {
    keyName = /[a-z]/.test(k) ? k.toUpperCase() : k
  } else if (/^F\d{1,2}$/.test(k)) {
    keyName = k
  } else if (
    ['Home', 'End', 'PageUp', 'PageDown', 'Insert', 'Delete', 'Backspace', 'Enter', 'Tab'].includes(
      k
    )
  ) {
    keyName = k
  } else {
    return null
  }

  parts.push(keyName)
  return parts.join('+')
}

function startRecording(): void {
  recording.value = true
}

function cancelRecording(): void {
  recording.value = false
}

function onKeydown(e: KeyboardEvent): void {
  if (!recording.value) return
  e.preventDefault()
  e.stopPropagation()
  if (e.key === 'Escape') {
    cancelRecording()
    return
  }
  const accelerator = keyToAccelerator(e)
  if (!accelerator) return
  emit('update:modelValue', accelerator)
  cancelRecording()
}

onMounted(() => window.addEventListener('keydown', onKeydown, true))
onUnmounted(() => window.removeEventListener('keydown', onKeydown, true))
</script>

<template>
  <Button
    variant="outline"
    :class="cn('min-w-40 justify-start gap-2 font-normal', props.buttonClass)"
    @click="startRecording"
    @blur="cancelRecording"
  >
    <Keyboard class="size-4 text-primary" />
    <span v-if="recording" class="animate-pulse text-primary">按下组合键…（Esc 取消）</span>
    <span v-else>{{ display || '点击录制' }}</span>
  </Button>
</template>
