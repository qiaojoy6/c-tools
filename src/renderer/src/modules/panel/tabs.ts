import type { Component } from 'vue'
import { defineAsyncComponent } from 'vue'
import { ClipboardList, FolderKanban, FolderOpen, Globe } from 'lucide-vue-next'
import type { PanelContributionMeta } from '@shared/modules/feature'
import ClipboardPage from '@renderer/pages/ClipboardPage.vue'
import QuickFoldersPage from '@renderer/pages/QuickFoldersPage.vue'
import ProjectsPage from '@renderer/pages/ProjectsPage.vue'

/** 面板侧边模块：在此注册 id / 文案 / 图标 / 页面组件即可 */
export interface PanelModuleTab extends PanelContributionMeta {
  icon: Component
  component: Component
}

export const PANEL_MODULES: PanelModuleTab[] = [
  {
    id: 'clipboard',
    label: '剪贴板',
    icon: ClipboardList,
    component: ClipboardPage
  },
  {
    id: 'quickFolders',
    label: '快捷文件夹',
    icon: FolderOpen,
    component: QuickFoldersPage
  },
  {
    id: 'projects',
    label: '项目',
    icon: FolderKanban,
    component: ProjectsPage,
    keepAlive: true
  },
  {
    id: 'hosts',
    label: 'Hosts',
    icon: Globe,
    // 异步加载，避免 CodeMirror 打进面板主包
    component: defineAsyncComponent(() => import('@renderer/pages/HostsPage.vue'))
  }
]
