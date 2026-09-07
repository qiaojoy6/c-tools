<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useTheme } from './composables/useTheme'

const route = useRoute()

useTheme()

/** 独立剪贴板用毛玻璃浮层壳；截屏遮罩无壳；功能面板 / 设置为普通窗 */
const shellMode = computed(() => {
  if (route.name === 'clipboard') return 'overlay'
  if (route.name === 'screenshot') return 'shot'
  return 'app'
})
</script>

<template>
  <div
    :class="{
      'app-shell': shellMode === 'app',
      'app-shell app-shell--overlay': shellMode === 'overlay',
      'app-shell app-shell--shot': shellMode === 'shot'
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
</style>
