import type { Component } from 'vue'
import { ClipboardList, FolderKanban, FolderOpen } from 'lucide-vue-next'

/** 面板侧边模块：后续新功能在此注册即可 */
export interface PanelModuleTab {
  id: string
  label: string
  icon: Component
}

export const PANEL_MODULES: PanelModuleTab[] = [
  {
    id: 'clipboard',
    label: '剪贴板',
    icon: ClipboardList
  },
  {
    id: 'quickFolders',
    label: '快捷文件夹',
    icon: FolderOpen
  },
  {
    id: 'projects',
    label: '项目',
    icon: FolderKanban
  }
]
