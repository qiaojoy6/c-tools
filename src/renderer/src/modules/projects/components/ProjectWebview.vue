<script setup lang="ts">
import type { WebviewContextMenuPayload } from '@shared/types'
import { ArrowLeft, ArrowRight, Lock, RotateCw } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

/**
 * 项目预览 webview：浏览器式工具栏 + guest 右键菜单（检查 / 开发者工具）
 * Electron 默认不为 <webview> 提供系统右键菜单
 */
const props = defineProps<{
  src: string
}>()

/** Electron webview 的 context-menu 事件带 params */
interface WebviewContextMenuEvent extends Event {
  params: Omit<WebviewContextMenuPayload, 'webContentsId'>
}

/** 导航相关 API（Electron <webview> 自定义元素） */
interface WebviewEl extends HTMLElement {
  getWebContentsId: () => number
  canGoBack: () => boolean
  canGoForward: () => boolean
  goBack: () => void
  goForward: () => void
  reload: () => void
  stop: () => void
  getURL: () => string
  loadURL: (url: string) => void
  isLoading: () => boolean
}

const webviewRef = ref<WebviewEl | null>(null)
const addressInputRef = ref<HTMLInputElement | null>(null)

/** 地址栏展示 / 编辑中的 URL */
const address = ref(props.src)
/** 是否正在编辑地址栏（编辑中不跟页面 URL 抢同步） */
const editingAddress = ref(false)
const canBack = ref(false)
const canForward = ref(false)
const loading = ref(false)

const reloadTitle = computed(() => (loading.value ? '停止' : '刷新'))
const isSecure = computed(() => address.value.startsWith('https:'))

function syncNavState(): void {
  const el = webviewRef.value
  if (!el) return
  try {
    canBack.value = el.canGoBack()
    canForward.value = el.canGoForward()
    loading.value = el.isLoading()
    if (!editingAddress.value) {
      const url = el.getURL()
      if (url) address.value = url
    }
  } catch {
    // webview 尚未就绪时 API 可能抛错，忽略
  }
}

function goBack(): void {
  const el = webviewRef.value
  if (el?.canGoBack()) el.goBack()
}

function goForward(): void {
  const el = webviewRef.value
  if (el?.canGoForward()) el.goForward()
}

function reloadOrStop(): void {
  const el = webviewRef.value
  if (!el) return
  if (el.isLoading()) el.stop()
  else el.reload()
}

/** 规范化地址栏输入后导航 */
function navigateToAddress(): void {
  const el = webviewRef.value
  if (!el) return
  let url = address.value.trim()
  if (!url) return
  // 无协议时按 http 补全（本地预览常见）
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) {
    url = `http://${url}`
  }
  editingAddress.value = false
  address.value = url
  try {
    el.loadURL(url)
  } catch {
    // ignore invalid URL
  }
}

function onAddressFocus(): void {
  editingAddress.value = true
  nextTick(() => addressInputRef.value?.select())
}

function onAddressBlur(): void {
  editingAddress.value = false
  syncNavState()
}

function onAddressKeydown(e: KeyboardEvent): void {
  // 中文等 IME 组词中的回车只确认候选，不跳转
  if (e.isComposing || e.keyCode === 229) return

  if (e.key === 'Enter') {
    e.preventDefault()
    navigateToAddress()
    addressInputRef.value?.blur()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    editingAddress.value = false
    syncNavState()
    addressInputRef.value?.blur()
  }
}

/** ⌘/Ctrl+L 聚焦地址栏（浏览器习惯） */
function onChromeKeydown(e: KeyboardEvent): void {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'l') {
    e.preventDefault()
    addressInputRef.value?.focus()
  }
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

const navEvents = [
  'did-navigate',
  'did-navigate-in-page',
  'did-start-loading',
  'did-stop-loading',
  'did-finish-load',
  'did-fail-load'
] as const

function bindWebview(el: WebviewEl | null): void {
  if (!el) return
  for (const name of navEvents) {
    el.addEventListener(name, syncNavState)
  }
  // dom-ready 后才能稳定读 URL / 历史
  el.addEventListener('dom-ready', syncNavState)
  syncNavState()
}

function unbindWebview(el: WebviewEl | null): void {
  if (!el) return
  for (const name of navEvents) {
    el.removeEventListener(name, syncNavState)
  }
  el.removeEventListener('dom-ready', syncNavState)
}

watch(webviewRef, (el, prev) => {
  unbindWebview(prev)
  bindWebview(el)
})

watch(
  () => props.src,
  (src) => {
    if (!editingAddress.value) address.value = src
  }
)

onBeforeUnmount(() => {
  unbindWebview(webviewRef.value)
})
</script>

<template>
  <div class="browser" @keydown="onChromeKeydown">
    <div class="chrome" role="toolbar" aria-label="浏览器工具栏">
      <div class="nav-group">
        <button
          type="button"
          class="nav-btn"
          title="后退"
          aria-label="后退"
          :disabled="!canBack"
          @click="goBack"
        >
          <ArrowLeft class="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          class="nav-btn"
          title="前进"
          aria-label="前进"
          :disabled="!canForward"
          @click="goForward"
        >
          <ArrowRight class="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          class="nav-btn"
          :title="reloadTitle"
          :aria-label="reloadTitle"
          @click="reloadOrStop"
        >
          <RotateCw class="h-3.5 w-3.5" :class="{ spinning: loading }" />
        </button>
      </div>

      <div class="omnibox">
        <Lock v-if="isSecure" class="omnibox-lock h-3 w-3" aria-hidden="true" />
        <input
          ref="addressInputRef"
          v-model="address"
          class="omnibox-input"
          type="text"
          spellcheck="false"
          autocomplete="off"
          aria-label="地址栏"
          @focus="onAddressFocus"
          @blur="onAddressBlur"
          @keydown="onAddressKeydown"
        />
      </div>
    </div>

    <div class="load-track" aria-hidden="true">
      <div class="load-bar" :data-active="loading" />
    </div>

    <div class="viewport">
      <webview
        ref="webviewRef"
        class="project-webview"
        :src="src"
        partition="persist:projects-preview"
        @context-menu="onContextMenu"
      />
    </div>
  </div>
</template>

<style scoped>
.browser {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  background: var(--background);
}

/* 与页签栏同一套灰底工具条 */
.chrome {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--border);
  background: color-mix(in oklab, var(--muted) 88%, var(--background));
  padding: 6px 10px;
}

.nav-group {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 2px;
}

.nav-btn {
  display: inline-flex;
  height: 28px;
  width: 28px;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--foreground);
  cursor: pointer;
  outline: none;
}

.nav-btn:hover:not(:disabled) {
  background: color-mix(in oklab, var(--foreground) 8%, transparent);
}

.nav-btn:focus-visible {
  box-shadow: inset 0 0 0 2px color-mix(in oklab, var(--ring) 40%, transparent);
}

.nav-btn:disabled {
  cursor: default;
  opacity: 0.35;
}

.spinning {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.omnibox {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 6px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: var(--background);
  padding: 0 12px;
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--border) 80%, transparent);
}

.omnibox:focus-within {
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--ring) 55%, var(--border));
}

.omnibox-lock {
  flex-shrink: 0;
  color: var(--muted-foreground);
}

.omnibox-input {
  min-width: 0;
  flex: 1;
  border: none;
  background: transparent;
  color: var(--foreground);
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  line-height: 1;
  outline: none;
}

.load-track {
  position: relative;
  height: 2px;
  flex-shrink: 0;
  overflow: hidden;
  background: transparent;
}

.load-bar {
  height: 100%;
  width: 0;
  background: color-mix(in oklab, var(--primary) 85%, white);
  opacity: 0;
  transition: opacity 0.15s ease;
}

.load-bar[data-active='true'] {
  opacity: 1;
  animation: load-indeterminate 1.1s ease-in-out infinite;
}

@keyframes load-indeterminate {
  0% {
    width: 0;
    margin-left: 0;
  }
  50% {
    width: 55%;
    margin-left: 20%;
  }
  100% {
    width: 0;
    margin-left: 100%;
  }
}

.viewport {
  position: relative;
  min-height: 0;
  flex: 1;
  background: #fff;
}

.project-webview {
  display: flex;
  width: 100%;
  height: 100%;
  border: none;
}

@media (prefers-reduced-motion: reduce) {
  .spinning,
  .load-bar[data-active='true'] {
    animation: none;
  }
}
</style>
