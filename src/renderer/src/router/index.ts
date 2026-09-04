import { createRouter, createWebHashHistory } from 'vue-router'

/**
 * 路由配置：每个功能模块对应一个页面（懒加载）
 * 新增功能时在 modules/<feature>/views 下建页面并在此注册
 */
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/clipboard' },
    {
      path: '/clipboard',
      name: 'clipboard',
      component: () => import('@renderer/pages/ClipboardPanel.vue')
    }
  ]
})

export default router
