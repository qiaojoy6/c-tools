import type { Component } from 'vue'
import { ClipboardList, FolderKanban, FolderOpen, Globe, Scan, Settings2, Video } from 'lucide-vue-next'
import type { SettingsContributionMeta } from '@shared/modules/feature'
import GeneralSettings from '@renderer/modules/settings/components/GeneralSettings.vue'
import ClipboardSettings from '@renderer/modules/settings/components/ClipboardSettings.vue'
import QuickFoldersSettings from '@renderer/modules/settings/components/QuickFoldersSettings.vue'
import ScreenshotSettings from '@renderer/modules/settings/components/ScreenshotSettings.vue'
import RecorderSettings from '@renderer/modules/settings/components/RecorderSettings.vue'
import ProjectSettings from '@renderer/modules/settings/components/ProjectSettings.vue'
import HostsSettings from '@renderer/modules/settings/components/HostsSettings.vue'

/** 设置侧边模块：在此注册 id / 文案 / 图标 / 设置页组件即可 */
export interface SettingsModuleTab extends SettingsContributionMeta {
  icon: Component
  component: Component
  /** 是否需要注入 config + apply（通用/剪贴板等）；false 则仅挂载组件 */
  needsConfig?: boolean
}

export const SETTINGS_MODULES: SettingsModuleTab[] = [
  {
    id: 'general',
    label: '通用',
    description: '主题、功能开关、开机自启与关于更新',
    icon: Settings2,
    component: GeneralSettings,
    needsConfig: true
  },
  {
    id: 'clipboard',
    label: '剪贴板',
    description: '呼出快捷键、记录与隐私',
    icon: ClipboardList,
    component: ClipboardSettings,
    needsConfig: true
  },
  {
    id: 'quickFolders',
    label: '快捷文件夹',
    description: '呼出快捷键与条数上限',
    icon: FolderOpen,
    component: QuickFoldersSettings,
    needsConfig: true
  },
  {
    id: 'screenshot',
    label: '截屏',
    description: '截屏快捷键与隐藏本应用',
    icon: Scan,
    component: ScreenshotSettings,
    needsConfig: true
  },
  {
    id: 'recorder',
    label: '录屏',
    description: '区域与全屏录屏快捷键',
    icon: Video,
    component: RecorderSettings,
    needsConfig: true
  },
  {
    id: 'projects',
    label: '项目',
    description: '预览分区缓存与浏览数据',
    icon: FolderKanban,
    component: ProjectSettings,
    needsConfig: false
  },
  {
    id: 'hosts',
    label: 'Hosts',
    description: '从系统移除 c-tools 标记段',
    icon: Globe,
    component: HostsSettings,
    needsConfig: false
  }
]
