import type { AppConfig } from '@shared/types'
import { onMounted, onUnmounted } from 'vue'

export type ThemeMode = AppConfig['general']['theme']

/** 根据配置与系统偏好解析是否深色 */
export function resolveIsDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true
  if (mode === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** 在根节点切换 .dark，驱动 CSS 变量 */
export function applyThemeClass(mode: ThemeMode): void {
  document.documentElement.classList.toggle('dark', resolveIsDark(mode))
}

/**
 * 各窗口挂载后同步主题：读配置 + 监听 config:updated + 系统配色变化
 */
export function useTheme(): void {
  let mode: ThemeMode = 'system'
  let offConfig: (() => void) | null = null
  let mql: MediaQueryList | null = null

  function sync(): void {
    applyThemeClass(mode)
  }

  function onSystemChange(): void {
    if (mode === 'system') sync()
  }

  onMounted(() => {
    void window.api.getConfig().then((cfg) => {
      mode = cfg.general.theme
      sync()
    })
    offConfig = window.api.onConfigUpdated((cfg) => {
      mode = cfg.general.theme
      sync()
    })
    mql = window.matchMedia('(prefers-color-scheme: dark)')
    mql.addEventListener('change', onSystemChange)
  })

  onUnmounted(() => {
    offConfig?.()
    offConfig = null
    mql?.removeEventListener('change', onSystemChange)
    mql = null
  })
}
