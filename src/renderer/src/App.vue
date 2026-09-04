<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

/** 浮层壳：独立剪贴板与功能面板共用毛玻璃样式 */
const isOverlayShell = computed(() => route.name === 'clipboard' || route.name === 'panel')

let offNavigate: (() => void) | null = null

onMounted(() => {
  // 主进程切换 /clipboard ↔ /panel 时不整页 reload
  offNavigate = window.api.onNavigate((path) => {
    void router.push(path)
  })
})

onUnmounted(() => {
  offNavigate?.()
})
</script>

<template>
  <div :class="isOverlayShell ? 'app-shell app-shell--panel' : 'app-shell'">
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

.app-shell--panel {
  border-radius: 20px;
  border: 1px solid rgb(255 255 255 / 10%);
  background-color: color-mix(in oklab, var(--background) 90%, transparent);
  box-shadow: 0 24px 80px -12px rgb(0 0 0 / 65%);
  backdrop-filter: blur(40px);
  background-image:
    radial-gradient(ellipse 80% 50% at 20% -10%, oklch(0.55 0.1 180 / 0.18), transparent),
    radial-gradient(ellipse 60% 40% at 100% 0%, oklch(0.45 0.06 230 / 0.12), transparent);
}
</style>
