import { defineFeature, type FeatureHandles } from '../feature'
import { trayMenuItem } from '../core'
import { RecorderHost } from './host'
import { RecorderSelectSession } from './session'
import { registerRecorderIpc } from './ipc'

/** 录屏托盘 / 快捷键共用动作 */
export type RecorderActions = {
  startRegion: () => void
  startFullscreen: () => void
  pauseResume: () => void
  stop: () => void
}

/** recorder Feature 的 setup 句柄 */
export type RecorderFeatureHandles = FeatureHandles & {
  host: RecorderHost
  select: RecorderSelectSession
  actions: RecorderActions
}

/**
 * 录屏主进程 Feature
 * 贡献：lifecycle + IPC `recorder:*` + 区域/全屏/暂停/停止快捷键
 * 依赖：ctx.shared.isScreenshotActive、getTray（托盘可延后注入）
 */
export const recorderFeature = defineFeature({
  id: 'recorder',
  setup(ctx): RecorderFeatureHandles {
    const host = new RecorderHost()
    host.load()

    const select = new RecorderSelectSession({
      host,
      beginConceal: (strategy) => ctx.windows.beginAppUiConceal(strategy),
      captureExternalFocus: () => ctx.windows.captureScreenshotExternalFocus(),
      settleAfterCapture: (opts) => ctx.windows.settleAfterCapture(opts),
      onRecordingChanged: () => ctx.shared.getTray?.()?.rebuild(),
      getFullscreenFloatPos: () => {
        const pos = ctx.config.get().recorder.fullscreenFloatPos
        if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return null
        return { x: pos.x, y: pos.y }
      },
      setFullscreenFloatPos: (pos) => {
        ctx.config.update({
          recorder: { fullscreenFloatPos: { x: pos.x, y: pos.y } }
        })
      },
      persistRecorderPrefs: (prefs) => {
        ctx.config.update({ recorder: prefs })
      }
    })

    // 回填互斥闸门，供截屏 start 时读取
    ctx.shared.isRecorderSelectActive = () => select.isActive

    const rebuildTray = (): void => {
      ctx.shared.getTray?.()?.rebuild()
    }

    /** 区域录屏：框选会话；框选中再点则取消 */
    const startRegionRecord = async (): Promise<void> => {
      try {
        if (select.isActive) {
          await select.cancelAsync()
          return
        }
        if (ctx.shared.isScreenshotActive?.()) return
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
        if (ctx.shared.isScreenshotActive?.()) return
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

    // 延后预热：避免热加载时在 config:update 同步路径里建窗抢焦点
    setImmediate(() => {
      select.prewarm()
    })

    return {
      host,
      select,
      actions,
      dispose: () => {
        select.hideRecordingBorder()
        select.cancel()
        host.dispose()
      }
    }
  },
  registerIpc(ctx, handles) {
    const h = handles as RecorderFeatureHandles
    registerRecorderIpc(h.host, h.select, {
      persistAudioPrefs: (prefs) => {
        ctx.config.update({ recorder: prefs })
      },
      persistRecorderPrefs: (prefs) => {
        ctx.config.update({ recorder: prefs })
      }
    })
  },
  bindShortcuts(_ctx, handles) {
    const h = handles as RecorderFeatureHandles
    return {
      recorderRegion: () => {
        h.actions.startRegion()
      },
      recorderFullscreen: () => {
        h.actions.startFullscreen()
      },
      recorderPauseResume: () => {
        h.actions.pauseResume()
      },
      recorderStop: () => {
        h.actions.stop()
      }
    }
  },
  bindTray(_ctx, handles) {
    const h = handles as RecorderFeatureHandles
    return {
      order: 20,
      items: (menuCtx) => {
        const sc = menuCtx.shortcuts
        const rs = menuCtx.recordingState
        if (rs === 'idle') {
          return [
            trayMenuItem('区域录屏', () => h.actions.startRegion(), sc.recorderRegion),
            trayMenuItem('全屏录屏', () => h.actions.startFullscreen(), sc.recorderFullscreen)
          ]
        }
        return [
          trayMenuItem(
            rs === 'paused' ? '继续录屏' : '暂停录屏',
            () => h.actions.pauseResume(),
            sc.recorderPauseResume
          ),
          trayMenuItem('停止录屏', () => h.actions.stop(), sc.recorderStop)
        ]
      }
    }
  }
})
