<script setup lang="ts">
import type { RecorderDeviceInfo, RecorderFullscreenInit } from '@shared/types'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Monitor, X } from 'lucide-vue-next'
import { Button } from '@renderer/components/ui/button'
import type { SelectOption } from '@renderer/components/ui/select'
import RecorderOptionsBar from '@renderer/modules/recorder/components/RecorderOptionsBar.vue'
import { useRecorderPrefs } from '@renderer/modules/recorder/composables/useRecorderPrefs'

/** 全屏录屏固定 MP4、默认 30fps；清晰度与区域录屏一致 */
const DEFAULT_FPS = 30

const init = ref<RecorderFullscreenInit | null>(null)
const selectedId = ref('')
const {
  enableMic,
  enableSystemAudio,
  quality,
  micDeviceId,
  mics,
  load: loadPrefs
} = useRecorderPrefs()
const starting = ref(false)

const screens = computed(() => init.value?.screens ?? [])

/** 麦克风下拉选项 */
const micOptions = computed<SelectOption[]>(() =>
  mics.value.map((d) => ({
    value: d.id,
    label: d.isPrimary ? `${d.name}（默认）` : d.name
  }))
)

function applyInit(payload: RecorderFullscreenInit): void {
  init.value = payload
  starting.value = false
  const primary = payload.screens.find((s) => s.isPrimary)
  selectedId.value = (primary ?? payload.screens[0])?.id ?? ''
  void loadPrefs()
  requestAnimationFrame(() => {
    window.api.recorder.fullscreenReady()
  })
}

function screenLabel(s: RecorderDeviceInfo): string {
  return s.isPrimary ? `${s.name}（主屏）` : s.name
}

function screenMeta(s: RecorderDeviceInfo): string {
  return `${s.width}×${s.height}`
}

async function onCancel(): Promise<void> {
  if (starting.value) return
  await window.api.recorder.cancelFullscreen()
}

async function onStart(): Promise<void> {
  if (!selectedId.value || starting.value) return
  starting.value = true
  try {
    await window.api.recorder.confirmFullscreen({
      screenId: selectedId.value,
      enableMic: enableMic.value,
      enableSystemAudio: enableSystemAudio.value,
      micDeviceId: micDeviceId.value.trim() || undefined,
      fps: DEFAULT_FPS,
      quality: quality.value
    })
  } finally {
    starting.value = false
  }
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    void onCancel()
  }
  if (e.key === 'Enter' && selectedId.value && !starting.value) {
    e.preventDefault()
    void onStart()
  }
}

let offInit: (() => void) | null = null

onMounted(() => {
  offInit = window.api.recorder.onFullscreenInit(applyInit)
  window.addEventListener('keydown', onKeyDown)
  // 页面已挂载即通知就绪（主进程可能稍后才发 init）
  window.api.recorder.fullscreenReady()
})

onUnmounted(() => {
  offInit?.()
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <div class="fs app-drag">
    <header class="fs-head app-no-drag">
      <div class="fs-title-wrap">
        <Monitor class="fs-title-ico" aria-hidden="true" />
        <h1 class="fs-title">全屏录制</h1>
      </div>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        class="text-muted-foreground"
        title="取消"
        aria-label="取消"
        :disabled="starting"
        @click="onCancel"
      >
        <X class="size-4" />
      </Button>
    </header>

    <p class="fs-desc app-no-drag">选择要录制的显示器，并设置声音与清晰度</p>

    <div class="fs-list app-no-drag" role="listbox" aria-label="显示器">
      <button
        v-for="s in screens"
        :key="s.id"
        type="button"
        role="option"
        class="fs-screen"
        :class="{ on: selectedId === s.id }"
        :aria-selected="selectedId === s.id"
        :disabled="starting"
        @click="selectedId = s.id"
      >
        <span class="fs-screen-ico" aria-hidden="true">
          <Monitor class="size-4" />
        </span>
        <span class="fs-screen-text">
          <span class="fs-screen-name">{{ screenLabel(s) }}</span>
          <span class="fs-screen-meta">{{ screenMeta(s) }}</span>
        </span>
      </button>
      <p v-if="!screens.length" class="fs-empty">未检测到显示器</p>
    </div>

    <RecorderOptionsBar
      v-model:enable-mic="enableMic"
      v-model:enable-system-audio="enableSystemAudio"
      v-model:quality="quality"
      v-model:mic-device-id="micDeviceId"
      :mic-options="micOptions"
      class="fs-opts app-no-drag"
      :disabled="starting"
    />

    <footer class="fs-foot app-no-drag">
      <Button type="button" variant="outline" size="sm" :disabled="starting" @click="onCancel">
        取消
      </Button>
      <Button
        type="button"
        size="sm"
        class="bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-600/40"
        :disabled="starting || !selectedId"
        @click="onStart"
      >
        {{ starting ? '启动中…' : '开始录制' }}
      </Button>
    </footer>
  </div>
</template>

<style scoped>
.fs {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 18px 18px 16px;
  background: var(--card);
  color: var(--foreground);
  font-family:
    'PingFang SC',
    'SF Pro Text',
    'Segoe UI',
    system-ui,
    sans-serif;
}
.fs-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.fs-title-wrap {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.fs-title-ico {
  width: 18px;
  height: 18px;
  color: #2563eb;
  flex-shrink: 0;
}
.fs-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.3;
}
.fs-desc {
  margin: 8px 0 14px;
  color: var(--muted-foreground);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
}
.fs-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding-right: 2px;
}
.fs-screen {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--card);
  text-align: left;
  cursor: pointer;
  transition:
    background 180ms ease,
    border-color 180ms ease;
}
.fs-screen:hover:not(:disabled) {
  background: var(--muted);
}
.fs-screen.on {
  border-color: #93c5fd;
  background: #eff6ff;
}
.fs-screen:disabled {
  opacity: 0.55;
  cursor: default;
}
.fs-screen-ico {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--muted);
  color: var(--muted-foreground);
  flex-shrink: 0;
}
.fs-screen.on .fs-screen-ico {
  background: #dbeafe;
  color: #2563eb;
}
.fs-screen-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.fs-screen-name {
  font-size: 13px;
  font-weight: 650;
  color: var(--foreground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fs-screen-meta {
  font-size: 12px;
  font-weight: 500;
  color: var(--muted-foreground);
  font-variant-numeric: tabular-nums;
}
.fs-empty {
  margin: 24px 0;
  text-align: center;
  color: var(--muted-foreground);
  font-size: 13px;
}
.fs-opts {
  margin-top: 14px;
}
.fs-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 14px;
}
</style>
