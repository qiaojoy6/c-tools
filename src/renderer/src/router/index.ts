import { createRouter, createWebHashHistory } from 'vue-router'

/**
 * 路由配置：每个窗口对应入口（懒加载）
 * 主进程按 hash 打开对应窗口（面板 /panel，设置 /settings）
 */
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/panel' },
    { path: '/clipboard', redirect: '/panel' },
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
