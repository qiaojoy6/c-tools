import { nativeTheme } from 'electron'
import type { AppConfig } from '@shared/types'

export type ThemeMode = AppConfig['general']['theme']

/** 解析配置主题是否为深色（system 跟 OS） */
export function resolveIsDark(theme: ThemeMode): boolean {
  if (theme === 'dark') return true
  if (theme === 'light') return false
  return nativeTheme.shouldUseDarkColors
}

/**
 * 同步 Electron 原生主题源，便于窗控 / 系统控件与配置一致
 */
export function applyNativeThemeSource(theme: ThemeMode): void {
  nativeTheme.themeSource = theme === 'system' ? 'system' : theme
}
