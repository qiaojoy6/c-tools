import type { ClipboardConfig } from './modules/clipboard'
import type { ProjectsConfig } from './modules/projects'
import type { QuickFoldersConfig } from './modules/quickFolders'
import type { RecorderConfig } from './modules/recorder'
import type { ScreenshotConfig } from './modules/screenshot'
import type { FeaturesConfig } from './modules/feature'
import type { ShortcutConfig } from './shortcuts'

/** ============ 应用全局配置类型 ============ */

/** 窗口配置（窗口创建可配置化） */
export interface WindowConfig {
  width: number
  height: number
  minWidth: number
  minHeight: number
  /** 是否无边框 */
  frame: boolean
  /** 是否透明（用于实现圆角面板） */
  transparent: boolean
  /** 常驻置顶 */
  alwaysOnTop: boolean
  /** 不显示在任务栏 */
  skipTaskbar: boolean
  resizable: boolean
  /** 面板距工作区顶部的偏移 */
  topOffset: number
  /** 失焦 / 点击窗口外空白时是否自动隐藏面板 */
  hideOnBlur: boolean
}

/** 隐私配置 */
export interface PrivacyConfig {
  /** 退出时清空全部记录 */
  clearOnQuit: boolean
  /** 启动时清空历史记录 */
  clearOnStart: boolean
}

/** 通用配置 */
export interface GeneralConfig {
  /** 开机自启 */
  launchAtLogin: boolean
  /** 界面主题：浅色 / 深色 / 跟随系统 */
  theme: 'system' | 'light' | 'dark'
}

/** 应用配置：全局段 + 各功能模块段 */
export interface AppConfig {
  window: WindowConfig
  shortcuts: ShortcutConfig
  clipboard: ClipboardConfig
  quickFolders: QuickFoldersConfig
  screenshot: ScreenshotConfig
  projects: ProjectsConfig
  privacy: PrivacyConfig
  general: GeneralConfig
  recorder: RecorderConfig
  /** 内置 Feature 开关（缺省全开；关 clipboard 时截屏也会跳过） */
  features: FeaturesConfig
}

/** 配置局部更新（递归 Partial） */
export type ConfigPatch = {
  [K in keyof AppConfig]?: Partial<AppConfig[K]>
}

/** config:update 返回值 */
export interface ConfigUpdateResult {
  config: AppConfig
  /** 应用配置时的警告（如快捷键注册失败） */
  warnings: string[]
}
