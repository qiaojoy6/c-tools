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
      path: '/quick-folders',
      name: 'quick-folders',
      component: () => import('@renderer/pages/QuickFoldersPage.vue')
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
    },
    {
      path: '/screenshot',
      name: 'screenshot',
      component: () => import('@renderer/pages/ScreenshotPage.vue')
    },
    {
      path: '/recorder-select',
      name: 'recorder-select',
      component: () => import('@renderer/pages/RecorderSelectPage.vue')
    },
    {
      path: '/recorder-fullscreen',
      name: 'recorder-fullscreen',
      component: () => import('@renderer/pages/RecorderFullscreenPage.vue')
    }
  ]
})

export default router
