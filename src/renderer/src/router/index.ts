import { createRouter, createWebHashHistory } from 'vue-router'

/**
 * 路由配置：每个功能模块对应一个页面（懒加载）
 * 主进程按 hash 打开对应窗口（面板 /clipboard，设置 /settings）
 */
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/clipboard' },
    {
      path: '/clipboard',
      name: 'clipboard',
      component: () => import('@renderer/pages/ClipboardPanel.vue')
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@renderer/pages/SettingsPage.vue')
    }
  ]
})

export default router
