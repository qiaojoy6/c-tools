<script setup lang="ts">
// 应用外壳：窗口容器样式 + 路由出口
// 各功能页面由 src/renderer/src/modules/<feature>/views 提供，通过 vue-router 跳转
</script>

<template>
  <div
    class="h-screen overflow-hidden rounded-2xl border border-border/60 bg-background/95 text-foreground shadow-2xl backdrop-blur-xl"
  >
    <router-view />
  </div>
</template>
