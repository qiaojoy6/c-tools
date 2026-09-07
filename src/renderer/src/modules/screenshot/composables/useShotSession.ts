import type { ShotOverlayInit } from '@shared/types'
import { computed, onMounted, onUnmounted, ref } from 'vue'

/**
 * 截屏遮罩会话：init 推送、窗口列表补全、冻结帧加载
 */
export function useShotSession(opts: {
  /** 新会话开始时清空选区/标注/工具条等 */
  onReset: () => void
  /** 背景图就绪后重绘 */
  onBgReady: () => void
}) {
  const init = ref<ShotOverlayInit | null>(null)
  const phase = ref<'select' | 'edit'>('select')
  const bgImg = ref<HTMLImageElement | null>(null)

  const vp = computed(() => init.value?.viewportOffset ?? { x: 0, y: 0 })

  const stageStyle = computed(() => {
    if (!init.value) return {}
    const { bounds } = init.value
    const o = vp.value
    return {
      width: `${bounds.width}px`,
      height: `${bounds.height}px`,
      transform: `translate(${-o.x}px, ${-o.y}px)`
    }
  })

  let offInit: (() => void) | null = null
  let offWindows: (() => void) | null = null

  /** 从主进程取冻结帧，data URL 可安全 toDataURL */
  async function loadBgFromMain(displayId: number): Promise<void> {
    const markReady = (): void => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.api.screenshot.overlayReady(displayId)
        })
      })
    }
    try {
      const b64 = await window.api.screenshot.framePng(displayId)
      if (!b64) {
        markReady()
        return
      }
      const img = new Image()
      img.decoding = 'sync'
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('data url image error'))
        img.src = `data:image/png;base64,${b64}`
      })
      bgImg.value = img
      opts.onBgReady()
      markReady()
    } catch (err) {
      console.error('[screenshot] bg load failed:', err)
      markReady()
    }
  }

  onMounted(() => {
    offInit = window.api.screenshot.onInit((payload) => {
      init.value = payload
      phase.value = 'select'
      bgImg.value = null
      opts.onReset()
      void loadBgFromMain(payload.displayId)
    })
    offWindows = window.api.screenshot.onWindows((payload) => {
      if (!init.value) return
      init.value = {
        ...init.value,
        windows: payload.windows,
        windowPickAvailable: payload.windowPickAvailable
      }
    })
  })

  onUnmounted(() => {
    offInit?.()
    offWindows?.()
  })

  return { init, phase, bgImg, vp, stageStyle }
}
