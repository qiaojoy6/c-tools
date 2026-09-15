/** 内置 / 外部插件共用的 Feature 标识与贡献点元数据类型（不含 Vue 组件） */

/** 已注册或计划迁入的功能 id */
export type FeatureId =
  | 'core'
  | 'clipboard'
  | 'quickFolders'
  | 'projects'
  | 'screenshot'
  | 'recorder'
  | 'hosts'
  | 'settings'

/** 可开关的业务 Feature（不含 core / settings 壳） */
export type ToggleableFeatureId =
  | 'clipboard'
  | 'quickFolders'
  | 'projects'
  | 'screenshot'
  | 'recorder'
  | 'hosts'

/** 功能开关配置；未列出的键默认启用 */
export type FeaturesConfig = {
  enabled?: Partial<Record<ToggleableFeatureId, boolean>>
}

/** 面板 Tab 元数据（渲染层另挂 component） */
export type PanelContributionMeta = {
  id: string
  label: string
  /** 首次进入后再挂载，之后用 v-show 保留状态（如 webview） */
  keepAlive?: boolean
}

/** 设置 Tab 元数据 */
export type SettingsContributionMeta = {
  id: string
  label: string
  description: string
}
