import type { ConfigManager } from '../../config'
import type {
  TrayManager,
  WindowManager,
  ShortcutHandlers,
  TrayContribution
} from '../core'

/**
 * 跨 Feature 可变共享面：先注册的 Feature 写入，后注册的在 setup/调用时读取。
 * 截屏 ↔ 录屏互斥、托盘延后注入均走这里。
 * clipboard 形状与 ClipboardHostServices 对齐，避免 feature ↔ clipboard 循环依赖。
 */
export type FeatureShared = {
  clipboard?: {
    ingestScreenshotPng: (png: Buffer) => boolean
  }
  isScreenshotActive?: () => boolean
  isRecorderSelectActive?: () => boolean
  getTray?: () => TrayManager | undefined
}

/** 主进程 Feature 装配上下文 */
export type FeatureContext = {
  config: ConfigManager
  windows: WindowManager
  shared: FeatureShared
}

/** 快捷键绑定闸门：截屏 / 录屏进行中忽略其它呼出类快捷键 */
export type FeatureShortcutGates = {
  isScreenshotActive: () => boolean
  isRecorderSelectActive: () => boolean
}

/** 再导出托盘贡献类型，便于 Feature 作者只依赖 feature 模块 */
export type { TrayContribution, TrayMenuContext } from '../core/trayManager'

/** setup 返回句柄；dispose 在退出时调用；可附带模块私有字段 */
export type FeatureHandles = {
  dispose?: () => void | Promise<void>
  // 允许 Feature 自带 runtime / store 等字段
  [key: string]: unknown
}

/**
 * 主进程 Feature 描述（注册表用擦除后的宽类型，避免 THandles 逆变冲突）
 * 具体 Feature 用 defineFeature 保留字面量类型。
 */
export type MainFeatureDescriptor = {
  id: string
  setup: (ctx: FeatureContext) => FeatureHandles
  registerIpc?: (ctx: FeatureContext, handles: FeatureHandles) => void
  bindShortcuts?: (
    ctx: FeatureContext,
    handles: FeatureHandles,
    gates: FeatureShortcutGates
  ) => Partial<ShortcutHandlers>
  bindTray?: (ctx: FeatureContext, handles: FeatureHandles) => TrayContribution | TrayContribution[]
}

/** 定义主进程 Feature；返回可放入 FeatureHost 的宽类型描述 */
export function defineFeature<THandles extends FeatureHandles>(descriptor: {
  id: string
  setup: (ctx: FeatureContext) => THandles
  registerIpc?: (ctx: FeatureContext, handles: THandles) => void
  bindShortcuts?: (
    ctx: FeatureContext,
    handles: THandles,
    gates: FeatureShortcutGates
  ) => Partial<ShortcutHandlers>
  bindTray?: (ctx: FeatureContext, handles: THandles) => TrayContribution | TrayContribution[]
}): MainFeatureDescriptor {
  return descriptor as MainFeatureDescriptor
}
