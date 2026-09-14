/**
 * 全局快捷键：类型 + 各平台默认值（集中管理，改默认只动这里）
 */

/** 全局快捷键配置（空字符串 = 关闭该快捷键） */
export interface ShortcutConfig {
  /** 呼出/隐藏剪贴板窗口，Electron Accelerator 格式 */
  toggleClipboard: string
  /** 呼出/隐藏快捷文件夹浮层；空则关闭（仍可用功能面板入口） */
  toggleQuickFolders: string
  /** 进入截屏；空则关闭（仍可用托盘等入口） */
  screenshot: string
  /** 进入区域录屏；空则关闭（仍可用托盘） */
  recorderRegion: string
  /** 进入全屏录屏；空则关闭（仍可用托盘） */
  recorderFullscreen: string
  /** 录制中暂停 / 继续；空则关闭（仍可用托盘 / 悬浮条） */
  recorderPauseResume: string
  /** 停止录屏；空则关闭（仍可用托盘 / 悬浮条） */
  recorderStop: string
}

/** 主进程 / 渲染进程均可安全判断是否 macOS */
export function isDarwinPlatform(platform?: string): boolean {
  if (platform) return platform === 'darwin'
  if (typeof process !== 'undefined' && typeof process.platform === 'string') {
    return process.platform === 'darwin'
  }
  if (typeof navigator !== 'undefined') {
    return /Mac|iPhone|iPod|iPad/i.test(navigator.platform || navigator.userAgent)
  }
  return false
}

/**
 * 各平台默认快捷键表。
 * 新增快捷键：先扩展 ShortcutConfig，再在此补 darwin / win 两项。
 */
export const DEFAULT_SHORTCUTS = {
  darwin: {
    toggleClipboard: 'Alt+Space',
    toggleQuickFolders: 'Command+Shift+O',
    screenshot: 'Command+Shift+A',
    recorderRegion: 'Command+Shift+R',
    recorderFullscreen: 'Command+Shift+F',
    recorderPauseResume: 'Command+Shift+P',
    recorderStop: 'Command+Shift+S'
  },
  win: {
    toggleClipboard: 'Alt+Space',
    toggleQuickFolders: 'Control+Shift+O',
    screenshot: 'Alt+A',
    recorderRegion: 'Alt+R',
    recorderFullscreen: 'Alt+Shift+F',
    recorderPauseResume: 'Alt+P',
    recorderStop: 'Alt+S'
  }
} as const satisfies Record<'darwin' | 'win', ShortcutConfig>

/** 按平台取完整默认快捷键配置 */
export function defaultShortcuts(platform?: string): ShortcutConfig {
  const table = isDarwinPlatform(platform) ? DEFAULT_SHORTCUTS.darwin : DEFAULT_SHORTCUTS.win
  return { ...table }
}

/** 取某一项默认快捷键（设置页「恢复默认」用） */
export function defaultShortcut(key: keyof ShortcutConfig, platform?: string): string {
  return defaultShortcuts(platform)[key]
}
