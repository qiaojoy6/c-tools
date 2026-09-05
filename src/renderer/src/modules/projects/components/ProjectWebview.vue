<script setup lang="ts">
import type { WebviewContextMenuPayload } from '@shared/types'
/**
 * 项目预览 webview：挂上 guest 右键菜单（检查 / 开发者工具）
 * Electron 默认不为 <webview> 提供系统右键菜单
 */
defineProps<{
  src: string
}>()

/** Electron webview 的 context-menu 事件带 params */
interface WebviewContextMenuEvent extends Event {
  params: Omit<WebviewContextMenuPayload, 'webContentsId'>
}

interface WebviewEl extends HTMLElement {
  getWebContentsId: () => number
}

function onContextMenu(e: Event): void {
  const ev = e as WebviewContextMenuEvent
  const el = e.currentTarget as WebviewEl
  const p = ev.params
  if (!p || typeof el.getWebContentsId !== 'function') return

  void window.api.popupWebviewContextMenu({
    webContentsId: el.getWebContentsId(),
    x: p.x,
    y: p.y,
    linkURL: p.linkURL,
    srcURL: p.srcURL,
    selectionText: p.selectionText,
    isEditable: p.isEditable,
    editFlags: p.editFlags
  })
}
</script>

<template>
  <webview
    class="project-webview"
    :src="src"
    partition="persist:projects-preview"
    @context-menu="onContextMenu"
  />
</template>

<style scoped>
.project-webview {
  display: flex;
  width: 100%;
  height: 100%;
  border: none;
}
</style>
