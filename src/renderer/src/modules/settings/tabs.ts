import type { Component } from 'vue'
import { ClipboardList, Settings2 } from 'lucide-vue-next'

/** 设置侧边模块：后续新功能在此注册即可 */
export interface SettingsModuleTab {
  id: string
  label: string
  description: string
  icon: Component
}

export const SETTINGS_MODULES: SettingsModuleTab[] = [
  {
    id: 'general',
    label: '通用',
    description: '主题、开机自启与关于更新',
    icon: Settings2
  },
  {
    id: 'clipboard',
    label: '剪贴板',
    description: '呼出快捷键、记录与隐私',
    icon: ClipboardList
  }
]
