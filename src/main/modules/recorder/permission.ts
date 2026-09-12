import { shell, systemPreferences } from 'electron'
import { hasScreenCapturePermission, openScreenCaptureSettings } from '../screenshot/permission'

/** 与 Electron getMediaAccessStatus 一致 */
export type MediaAccessStatus =
  | 'not-determined'
  | 'granted'
  | 'denied'
  | 'restricted'
  | 'unknown'

export interface RecorderAudioPermissions {
  /** 麦克风 TCC / Windows 隐私 */
  mic: MediaAccessStatus
  micGranted: boolean
  /**
   * 系统声：
   * - macOS：依赖屏幕录制（SCK 同源系统声 / Process Tap 同属录屏隐私）
   * - Windows：环回一般无需额外授权
   */
  systemAudioGranted: boolean
}

/** 麦克风权限状态 */
export function getMicAccessStatus(): MediaAccessStatus {
  if (process.platform !== 'darwin' && process.platform !== 'win32') return 'granted'
  try {
    const s = systemPreferences.getMediaAccessStatus('microphone')
    if (
      s === 'granted' ||
      s === 'denied' ||
      s === 'restricted' ||
      s === 'not-determined' ||
      s === 'unknown'
    ) {
      return s
    }
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

export function hasMicPermission(): boolean {
  return getMicAccessStatus() === 'granted'
}

/** 申请麦克风（仅 macOS 会弹窗；已拒绝则不会再弹） */
export async function requestMicPermission(): Promise<boolean> {
  if (process.platform === 'darwin') {
    try {
      const status = getMicAccessStatus()
      if (status === 'granted') return true
      if (status === 'denied' || status === 'restricted') return false
      return await systemPreferences.askForMediaAccess('microphone')
    } catch (err) {
      console.warn('[recorder] ask mic failed:', err)
      return false
    }
  }
  // Windows：无 ask API，以当前状态为准
  return hasMicPermission()
}

/** 打开系统麦克风设置 */
export async function openMicSettings(): Promise<void> {
  try {
    if (process.platform === 'darwin') {
      await shell.openExternal(
        'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'
      )
    } else if (process.platform === 'win32') {
      await shell.openExternal('ms-settings:privacy-microphone')
    }
  } catch (err) {
    console.error('[recorder] open mic settings failed:', err)
  }
}

/**
 * 系统声是否可用。
 * macOS 走 SCK/屏幕录制隐私；无屏幕权限则不能开系统声。
 */
export function hasSystemAudioPermission(): boolean {
  if (process.platform !== 'darwin') return true
  return hasScreenCapturePermission()
}

/** 打开系统声相关设置（macOS → 屏幕录制） */
export async function openSystemAudioSettings(): Promise<void> {
  if (process.platform === 'darwin') {
    await openScreenCaptureSettings()
    return
  }
  // Windows 无单独系统声隐私页
}

export function getAudioPermissions(): RecorderAudioPermissions {
  const mic = getMicAccessStatus()
  return {
    mic,
    micGranted: mic === 'granted',
    systemAudioGranted: hasSystemAudioPermission()
  }
}
