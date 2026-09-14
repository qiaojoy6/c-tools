import type { ToggleableFeatureId } from '@shared/modules/feature'

/** 设置页「功能模块」开关列表（与 Host / Panel 过滤共用 id） */
export const FEATURE_TOGGLE_OPTIONS: Array<{
  id: ToggleableFeatureId
  label: string
  description: string
}> = [
  {
    id: 'clipboard',
    label: '剪贴板',
    description: '历史监听、浮层与面板；关闭后截屏入库也会停用'
  },
  {
    id: 'quickFolders',
    label: '快捷文件夹',
    description: '书签列表、浮层与全局快捷键'
  },
  {
    id: 'projects',
    label: '项目',
    description: '工作区扫描与本地预览'
  },
  {
    id: 'screenshot',
    label: '截屏',
    description: '全局截屏与托盘入口（依赖剪贴板）'
  },
  {
    id: 'recorder',
    label: '录屏',
    description: '区域 / 全屏录屏与托盘控制'
  }
]
