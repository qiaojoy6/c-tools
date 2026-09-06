<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useTheme } from './composables/useTheme'
import { logApi } from './utils/logApi'

const route = useRoute()

useTheme()

onMounted(() => {
  logApi.info('App.vue')
})

/** 独立剪贴板用毛玻璃浮层壳；功能面板 / 设置为普通窗 */
const isOverlayShell = computed(() => route.name === 'clipboard')
</script>

<template>
  <div :class="isOverlayShell ? 'app-shell app-shell--overlay' : 'app-shell'">
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
</style>
