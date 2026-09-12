import { ref, watch, type Ref } from 'vue'
import type {
  RecorderAudioPermissions,
  RecorderDeviceInfo,
  RecorderVideoQuality
} from '@shared/types'

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
 * 无对应权限时强制关，且不可选开。
 */
export function useRecorderPrefs(): {
  enableMic: Ref<boolean>
  enableSystemAudio: Ref<boolean>
  quality: Ref<RecorderVideoQuality>
  micDeviceId: Ref<string>
  mics: Ref<RecorderDeviceInfo[]>
  micGranted: Ref<boolean>
  systemAudioGranted: Ref<boolean>
  load: () => Promise<void>
  refreshPermissions: () => Promise<void>
  /** 尝试打开麦克风：无权限则先关框选/选屏窗再申请，失败再打开系统设置 */
  tryEnableMic: () => Promise<boolean>
  /** 尝试打开系统声：无权限则先关框选/选屏窗再打开系统设置 */
  tryEnableSystemAudio: () => Promise<boolean>
} {
  const enableMic = ref(true)
  const enableSystemAudio = ref(true)
  const quality = ref<RecorderVideoQuality>('original')
  const micDeviceId = ref('')
  const mics = ref<RecorderDeviceInfo[]>([])
  const micGranted = ref(true)
  const systemAudioGranted = ref(true)
  let hydrated = false

  function applyPermissions(p: RecorderAudioPermissions): void {
    micGranted.value = p.micGranted
    systemAudioGranted.value = p.systemAudioGranted
    // 无权限不能保持「开」
    if (!p.micGranted && enableMic.value) enableMic.value = false
    if (!p.systemAudioGranted && enableSystemAudio.value) enableSystemAudio.value = false
  }

  async function refreshPermissions(): Promise<void> {
    try {
      const p = await window.api.recorder.getAudioPermissions()
      applyPermissions(p)
    } catch (err) {
      console.warn('[recorder] audio permissions failed:', err)
    }
  }

  async function tryEnableMic(): Promise<boolean> {
    if (micGranted.value) {
      enableMic.value = true
      return true
    }
    try {
      // 主进程会先关框选/选屏再申请；已拒绝则打开系统设置
      const res = await window.api.recorder.requestMicPermission()
      applyPermissions(res)
      if (res.granted || res.micGranted) {
        enableMic.value = true
        return true
      }
    } catch (err) {
      console.warn('[recorder] request mic failed:', err)
    }
    enableMic.value = false
    return false
  }

  async function tryEnableSystemAudio(): Promise<boolean> {
    if (systemAudioGranted.value) {
      enableSystemAudio.value = true
      return true
    }
    try {
      // 主进程会先关框选/选屏再打开屏幕录制设置
      await window.api.recorder.openSystemAudioSettings()
    } catch (err) {
      console.warn('[recorder] open system audio settings failed:', err)
    }
    enableSystemAudio.value = false
    return false
  }

  async function load(): Promise<void> {
    hydrated = false
    try {
      const [cfg, list, perms] = await Promise.all([
        window.api.getConfig(),
        window.api.recorder.listMics().catch((err) => {
          console.warn('[recorder] listMics failed:', err)
          return [] as RecorderDeviceInfo[]
        }),
        window.api.recorder.getAudioPermissions().catch((err) => {
          console.warn('[recorder] audio permissions failed:', err)
          return {
            mic: 'unknown',
            micGranted: true,
            systemAudioGranted: true
          } as RecorderAudioPermissions
        })
      ])
      enableMic.value = cfg.recorder?.enableMic !== false
      enableSystemAudio.value = cfg.recorder?.enableSystemAudio !== false
      quality.value = clampQuality(cfg.recorder?.quality)
      mics.value = list
      const saved =
        typeof cfg.recorder?.micDeviceId === 'string' ? cfg.recorder.micDeviceId.trim() : ''
      micDeviceId.value = pickMicId(list, saved)
      applyPermissions(perms)
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

  return {
    enableMic,
    enableSystemAudio,
    quality,
    micDeviceId,
    mics,
    micGranted,
    systemAudioGranted,
    load,
    refreshPermissions,
    tryEnableMic,
    tryEnableSystemAudio
  }
}
