<script setup lang="ts">
/**
 * 功能面板通栏自定义表头：仅标题与拖拽区
 * 最小化 / 最大化 / 关闭由主进程 titleBarStyle + titleBarOverlay（原生）提供
 * 高度与标题见 appTuning.PANEL_WINDOW
 */
import { PANEL_WINDOW } from '@shared/appTuning'

const isMac = navigator.userAgent.includes('Mac')
</script>

<template>
  <header
    class="titlebar app-drag"
    :class="isMac ? 'titlebar--mac' : 'titlebar--win'"
    :style="{ height: `${PANEL_WINDOW.titleBarHeight}px` }"
  >
    <span class="title">{{ PANEL_WINDOW.title }}</span>
  </header>
</template>

<style scoped>
.titlebar {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  border-bottom: 1px solid color-mix(in oklab, var(--border) 40%, transparent);
  background: color-mix(in oklab, var(--rail) 70%, transparent);
}

/* macOS：避开左侧交通灯（与主进程 trafficLightPosition 紧凑 inset 对齐） */
.titlebar--mac {
  padding: 0 16px 0 65px;
}

/* Windows / Linux：右侧留给 titleBarOverlay 原生窗控 */
.titlebar--win {
  padding: 0 140px 0 16px;
}

.title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
  color: var(--muted-foreground);
}

</style>
