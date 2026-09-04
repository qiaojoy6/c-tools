import { createRouter, createWebHashHistory } from 'vue-router'

/**
 * 路由配置：每个窗口形态对应入口（懒加载）
 * 主进程按 hash 打开：独立剪贴板 /clipboard，功能面板 /panel，设置 /settings
 */
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/clipboard' },
    {
      path: '/clipboard',
      name: 'clipboard',
      component: () => import('@renderer/pages/ClipboardPage.vue')
    },
    {
      path: '/panel',
      name: 'panel',
      component: () => import('@renderer/pages/PanelPage.vue')
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@renderer/pages/SettingsPage.vue')
    }
  ]
})

export default router
