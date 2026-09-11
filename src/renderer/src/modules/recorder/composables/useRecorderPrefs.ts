import { ref, watch, type Ref } from 'vue'
import type { RecorderDeviceInfo, RecorderVideoQuality } from '@shared/types'

function clampQuality(raw: unknown): RecorderVideoQuality {
  const q = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (q === 'ultra' || q === 'smooth' || q === 'original') return q
  return 'original'
}

/** 在枚举列表中解析默认麦克风 id */
function pickMicId(list: RecorderDeviceInfo[], preferred: string): string {
  if (preferred && list.some((d) => d.id === preferred)) return preferred
  const primary = list.find((d) => d.isPrimary)
  return (primary ?? list[0])?.id ?? ''
}

/**
 * 录屏选项（麦 / 系统声 / 清晰度 / 麦设备）与 settings.json 同步。
 */
export function useRecorderPrefs(): {
  enableMic: Ref<boolean>
  enableSystemAudio: Ref<boolean>
  quality: Ref<RecorderVideoQuality>
  micDeviceId: Ref<string>
  mics: Ref<RecorderDeviceInfo[]>
  load: () => Promise<void>
} {
  const enableMic = ref(true)
  const enableSystemAudio = ref(true)
  const quality = ref<RecorderVideoQuality>('original')
  const micDeviceId = ref('')
  const mics = ref<RecorderDeviceInfo[]>([])
  let hydrated = false

  async function load(): Promise<void> {
    hydrated = false
    try {
      const [cfg, list] = await Promise.all([
        window.api.getConfig(),
        window.api.recorder.listMics().catch((err) => {
          console.warn('[recorder] listMics failed:', err)
          return [] as RecorderDeviceInfo[]
        })
      ])
      enableMic.value = cfg.recorder?.enableMic !== false
      enableSystemAudio.value = cfg.recorder?.enableSystemAudio !== false
      quality.value = clampQuality(cfg.recorder?.quality)
      mics.value = list
      const saved =
        typeof cfg.recorder?.micDeviceId === 'string' ? cfg.recorder.micDeviceId.trim() : ''
      micDeviceId.value = pickMicId(list, saved)
    } catch (err) {
      console.warn('[recorder] load prefs failed:', err)
      enableMic.value = true
      enableSystemAudio.value = true
      quality.value = 'original'
      mics.value = []
      micDeviceId.value = ''
    } finally {
      hydrated = true
    }
  }

  function persist(): void {
    if (!hydrated) return
    void window.api
      .updateConfig({
        recorder: {
          enableMic: enableMic.value,
          enableSystemAudio: enableSystemAudio.value,
          quality: quality.value,
          micDeviceId: micDeviceId.value.trim() || null
        }
      })
      .catch((err) => console.warn('[recorder] save prefs failed:', err))
  }

  watch([enableMic, enableSystemAudio, quality, micDeviceId], persist)

  return { enableMic, enableSystemAudio, quality, micDeviceId, mics, load }
}
