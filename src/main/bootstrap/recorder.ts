import type { ConfigManager } from '../config'
import type { TrayManager, WindowManager } from '../modules/core'
import { RecorderHost, RecorderSelectSession } from '../modules/recorder'
import type { RecorderActions } from './context'

export type RecorderSetupDeps = {
  config: ConfigManager
  windows: WindowManager
  /** 截屏进行中则不可开录 */
  isScreenshotActive: () => boolean
  /** 托盘已创建后刷新菜单（可延后赋值） */
  getTray: () => TrayManager | undefined
}

export type RecorderStack = {
  host: RecorderHost
  select: RecorderSelectSession
  actions: RecorderActions
}

/** 创建录屏宿主与框选会话，并导出托盘/快捷键动作 */
export function setupRecorder(deps: RecorderSetupDeps): RecorderStack {
  const host = new RecorderHost()
  host.load()

  const select = new RecorderSelectSession({
    host,
    hideAppWindows: () => deps.windows.captureAndHideAppWindows(),
    captureExternalFocus: () => deps.windows.captureScreenshotExternalFocus(),
    settleAfterSelect: (opts) => deps.windows.settleAfterScreenshot(opts),
    onRecordingChanged: () => deps.getTray()?.rebuild(),
    getFullscreenFloatPos: () => {
      const pos = deps.config.get().recorder.fullscreenFloatPos
      if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return null
      return { x: pos.x, y: pos.y }
    },
    setFullscreenFloatPos: (pos) => {
      deps.config.update({
        recorder: { fullscreenFloatPos: { x: pos.x, y: pos.y } }
      })
    },
    persistRecorderPrefs: (prefs) => {
      deps.config.update({ recorder: prefs })
    }
  })

  const rebuildTray = (): void => {
    deps.getTray()?.rebuild()
  }

  /** 区域录屏：框选会话；框选中再点则取消 */
  const startRegionRecord = async (): Promise<void> => {
    try {
      if (select.isActive) {
        await select.cancelAsync()
        return
      }
      if (deps.isScreenshotActive()) return
      const st = host.status()
      if (!st.available) {
        console.error('[recorder] unavailable:', st.reason)
        return
      }
      if (st.state !== 'idle') return
      await select.startRegion()
    } catch (err) {
      console.error('[recorder] region start failed:', err)
    } finally {
      rebuildTray()
    }
  }

  /** 全屏录屏：选屏 Dialog + 声音/清晰度 */
  const startFullscreenRecord = async (): Promise<void> => {
    try {
      if (deps.isScreenshotActive()) return
      const st = host.status()
      if (!st.available) {
        console.error('[recorder] unavailable:', st.reason)
        return
      }
      if (st.state !== 'idle') return
      await select.startFullscreen()
    } catch (err) {
      console.error('[recorder] fullscreen start failed:', err)
    } finally {
      rebuildTray()
    }
  }

  /** 录制中停止并收外框；成片后弹自定义保存路径 */
  const stopScreenRecord = (): void => {
    select.stopRecording({ promptSave: true })
    rebuildTray()
  }

  /** 录制中暂停 ↔ 继续（空闲/框选中忽略） */
  const togglePauseRecord = (): void => {
    try {
      const st = host.status()
      if (st.state === 'recording') {
        host.pause()
      } else if (st.state === 'paused') {
        host.resume()
      }
    } catch (err) {
      console.error('[recorder] pause/resume failed:', err)
    } finally {
      rebuildTray()
    }
  }

  const actions: RecorderActions = {
    startRegion: () => {
      void startRegionRecord()
    },
    startFullscreen: () => {
      void startFullscreenRecord()
    },
    pauseResume: () => {
      togglePauseRecord()
    },
    stop: () => {
      stopScreenRecord()
    }
  }

  host.onEvent((event) => {
    if (event.type === 'finished' || (event.type === 'stateChanged' && event.state === 'idle')) {
      select.hideRecordingBorder()
    }
    rebuildTray()
  })

  return { host, select, actions }
}
