import { randomUUID } from 'crypto'
import { dialog, screen } from 'electron'
import type { AppConfig, ShotDisplayFrame } from '@shared/types'
import { delay } from '../core/windows/loadRoute'
import { captureAllDisplays, clearFrameBuffers, resetScreenshotTemp } from './capture'
import { completeScreenshot, saveScreenshotPng, type CompleteDeps } from './complete'
import { ScreenshotOverlayHost } from './overlayHost'
import { hasScreenCapturePermission, openScreenCaptureSettings } from './permission'
import { listAppWindows } from './windowHit'

export interface ScreenshotSessionDeps extends CompleteDeps {
  getConfig: () => AppConfig
  hideAppWindows: () => { clipboard: boolean; panel: boolean; settings: boolean }
  restoreAppWindows: (state: { clipboard: boolean; panel: boolean; settings: boolean }) => void
}

/**
 * 截屏会话：先抓屏出遮罩，窗口列表异步补上
 */
export class ScreenshotSession {
  private active = false
  private sessionId = ''
  private frames: ShotDisplayFrame[] = []
  private savedVisibility: { clipboard: boolean; panel: boolean; settings: boolean } | null =
    null
  private readonly overlays = new ScreenshotOverlayHost()
  private startSeq = 0
  private cleaning = false

  constructor(private deps: ScreenshotSessionDeps) {}

  get isActive(): boolean {
    return this.active
  }

  prewarm(): void {
    try {
      this.overlays.prewarm()
      for (const d of screen.getAllDisplays()) {
        void this.overlays.waitPageReady(d.id)
      }
    } catch (err) {
      console.warn('[screenshot] prewarm failed:', err)
    }
  }

  async start(): Promise<void> {
    if (this.active) {
      await this.cancelAsync()
      return
    }

    if (!hasScreenCapturePermission()) {
      const { response } = await dialog.showMessageBox({
        type: 'warning',
        title: '需要屏幕录制权限',
        message: '截屏需要「屏幕录制」权限才能捕获画面。',
        detail: '请在系统设置中允许 c-tools 使用屏幕录制，然后重新尝试截屏。',
        buttons: ['打开系统设置', '取消'],
        defaultId: 0,
        cancelId: 1
      })
      if (response === 0) await openScreenCaptureSettings()
      return
    }

    const seq = ++this.startSeq
    this.active = true
    this.sessionId = randomUUID()

    try {
      if (this.deps.getConfig().screenshot.hideAppWindows) {
        this.savedVisibility = this.deps.hideAppWindows()
        await delay(16)
      } else {
        this.savedVisibility = null
      }
      if (seq !== this.startSeq) return

      this.frames = await captureAllDisplays()
      if (seq !== this.startSeq) return

      if (!this.frames.length) {
        dialog.showErrorBox('截屏失败', '未能捕获任何显示器画面。')
        await this.finishCleanupAsync()
        return
      }

      await this.overlays.showSession(this.sessionId, this.frames, [], false)
      void this.fillWindowsAsync(seq)
    } catch (err) {
      console.error('[screenshot] start failed:', err)
      dialog.showErrorBox('截屏失败', err instanceof Error ? err.message : String(err))
      await this.finishCleanupAsync()
    }
  }

  private async fillWindowsAsync(seq: number): Promise<void> {
    try {
      const windows = await listAppWindows()
      if (seq !== this.startSeq || !this.active) return
      this.overlays.updateWindows(windows, windows.length > 0)
    } catch (err) {
      console.warn('[screenshot] window list async failed:', err)
    }
  }

  cancel(): void {
    void this.cancelAsync()
  }

  async cancelAsync(): Promise<void> {
    this.startSeq++
    if (!this.active && !this.overlays.isActive) return
    await this.finishCleanupAsync()
  }

  async complete(pngBase64: string): Promise<boolean> {
    if (!this.active) return false
    try {
      const png = Buffer.from(pngBase64, 'base64')
      const ok = completeScreenshot(png, this.deps)
      await this.finishCleanupAsync()
      return ok
    } catch (err) {
      console.error('[screenshot] complete failed:', err)
      return false
    }
  }

  async save(pngBase64: string): Promise<boolean> {
    if (!this.active) return false
    try {
      const png = Buffer.from(pngBase64, 'base64')
      // 先退出截屏再弹对话框，否则 mac 上确定/回车不可用
      await this.finishCleanupAsync()
      await delay(80)
      return await saveScreenshotPng(png)
    } catch (err) {
      console.error('[screenshot] save failed:', err)
      return false
    }
  }

  private async finishCleanupAsync(): Promise<void> {
    if (this.cleaning) return
    this.cleaning = true
    try {
      await this.overlays.hideAll()
      this.frames = []
      this.sessionId = ''
      this.active = false
      clearFrameBuffers()
      if (this.savedVisibility) {
        this.deps.restoreAppWindows(this.savedVisibility)
        this.savedVisibility = null
      }
      setTimeout(() => {
        try {
          resetScreenshotTemp()
        } catch {
          /* ignore */
        }
      }, 0)
    } finally {
      this.cleaning = false
    }
  }
}

export function hideAppBrowserWindows(windows: {
  clipboard: { isVisible(): boolean; hide(): void }
  panel: { isVisible(): boolean; hide(): void }
  settings: { isVisible(): boolean; hide(): void }
}): { clipboard: boolean; panel: boolean; settings: boolean } {
  const state = {
    clipboard: windows.clipboard.isVisible(),
    panel: windows.panel.isVisible(),
    settings: windows.settings.isVisible()
  }
  if (state.clipboard) windows.clipboard.hide()
  if (state.panel) windows.panel.hide()
  if (state.settings) windows.settings.hide()
  return state
}
