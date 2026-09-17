<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useTheme } from './composables/useTheme'

const route = useRoute()

useTheme()

/** 剪贴板 / 快捷文件夹用毛玻璃浮层壳；截屏/录屏框选遮罩无壳；全屏选屏 Dialog 白底；功能面板 / 设置为普通窗 */
const shellMode = computed(() => {
  if (route.name === 'clipboard' || route.name === 'quick-folders') return 'overlay'
  if (route.name === 'screenshot' || route.name === 'recorder-select') return 'shot'
  if (route.name === 'recorder-fullscreen') return 'dialog'
  return 'app'
})
</script>

<template>
  <div
    :class="{
      'app-shell': shellMode === 'app',
      'app-shell app-shell--overlay': shellMode === 'overlay',
      'app-shell app-shell--shot': shellMode === 'shot',
      'app-shell app-shell--dialog': shellMode === 'dialog'
    }"
  >
    <router-view />
  </div>
</template>

<style scoped>
.app-shell {
  height: 100vh;
  overflow: hidden;
  color: var(--foreground);
  background: var(--background);
}

.app-shell--overlay {
  border-radius: 18px;
  border: 1px solid color-mix(in oklab, var(--border) 70%, transparent);
  background-color: color-mix(in oklab, var(--background) 94%, transparent);
  box-shadow: 0 22px 64px -18px color-mix(in oklab, var(--foreground) 22%, transparent);
  backdrop-filter: blur(36px);
  background-image:
    radial-gradient(ellipse 70% 45% at 12% -8%, oklch(0.78 0.012 265 / 0.1), transparent),
    radial-gradient(ellipse 55% 40% at 100% 0%, oklch(0.9 0.006 260 / 0.14), transparent);
}

.app-shell--shot {
  height: 100vh;
  overflow: hidden;
  background: transparent;
  color: inherit;
}

.app-shell--dialog {
  background: #fff;
  color: #1f2937;
}
</style>
