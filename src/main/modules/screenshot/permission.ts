import { shell, systemPreferences } from 'electron'

/** macOS：是否已授予屏幕录制权限 */
export function hasScreenCapturePermission(): boolean {
  if (process.platform !== 'darwin') return true
  try {
    const status = systemPreferences.getMediaAccessStatus('screen')
    return status === 'granted'
  } catch {
    return true
  }
}

/** 打开系统屏幕录制设置（macOS） */
export async function openScreenCaptureSettings(): Promise<void> {
  if (process.platform !== 'darwin') return
  try {
    await shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
    )
  } catch (err) {
    console.error('[screenshot] open settings failed:', err)
  }
}
