<script setup lang="ts">
import type { WebviewContextMenuPayload } from '@shared/types'
import { PROJECTS_PREVIEW_PARTITION } from '@shared/types'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@renderer/components/ui/context-menu'
import { ArrowLeft, ArrowRight, Eraser, Lock, RotateCw } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

/**
 * 项目预览 webview：浏览器式工具栏 + guest 右键菜单（检查 / 开发者工具）
 * Electron 默认不为 <webview> 提供系统右键菜单
 * target=_blank / window.open 由主进程 deny 后经 IPC 冒泡为 open-window
 */
const props = defineProps<{
  src: string
}>()

const emit = defineEmits<{
  'open-window': [url: string]
  'title-updated': [title: string]
  'icon-updated': [iconUrl: string]
  /** 请求清除当前页 origin 的浏览数据：须由宿主先卸掉全部 webview 再清 */
  'clear-cache-request': [origin: string]
}>()

const BLANK_URL = 'about:blank'

function isBlankUrl(url: string): boolean {
  return !url || url === BLANK_URL
}

/** 从 URL 取可清除的 http(s) origin */
function originFromUrl(raw: string): string | null {
  if (isBlankUrl(raw)) return null
  try {
    const u = new URL(raw)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.origin
  } catch {
    return null
  }
}

/** 地址栏展示：空白页不显示 about:blank，方便直接输入 */
function addressFromUrl(url: string): string {
  return isBlankUrl(url) ? '' : url
}

/** Electron webview 的 context-menu 事件带 params */
interface WebviewContextMenuEvent extends Event {
  params: Omit<WebviewContextMenuPayload, 'webContentsId'>
}

/** page-title-updated 事件 */
interface WebviewTitleEvent extends Event {
  title: string
}

/** page-favicon-updated 事件 */
interface WebviewFaviconEvent extends Event {
  favicons: string[]
}

/** 导航相关 API（Electron <webview> 自定义元素） */
interface WebviewEl extends HTMLElement {
  getWebContentsId: () => number
  canGoBack: () => boolean
  canGoForward: () => boolean
  goBack: () => void
  goForward: () => void
  reload: () => void
  /** 绕过 HTTP 缓存强制拉取（避免 304/本地缓存命中） */
  reloadIgnoringCache: () => void
  stop: () => void
  getURL: () => string
  loadURL: (url: string) => void
  isLoading: () => boolean
  executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>
}

const webviewRef = ref<WebviewEl | null>(null)
const addressInputRef = ref<HTMLInputElement | null>(null)

/** 地址栏展示 / 编辑中的 URL */
const address = ref(addressFromUrl(props.src))
/** 是否正在编辑地址栏（编辑中不跟页面 URL 抢同步） */
const editingAddress = ref(false)
const canBack = ref(false)
const canForward = ref(false)
const loading = ref(false)

const reloadTitle = computed(() => (loading.value ? '停止' : '刷新（右键强制刷新）'))
const isSecure = computed(() => address.value.startsWith('https:'))
/** 工具栏「清除」可用的当前 origin（跟地址栏同步） */
const clearableOrigin = computed(() => originFromUrl(address.value || props.src))

/** 交给宿主：先卸 webview，再按当前 origin 清数据，避免 clearStorage 时原生崩溃 */
function requestClearCache(): void {
  const el = webviewRef.value
  let raw = address.value || props.src
  try {
    const pageUrl = el?.getURL()
    if (pageUrl) raw = pageUrl
  } catch {
    // webview 未就绪则用地址栏
  }
  const origin = originFromUrl(raw)
  if (!origin) return
  emit('clear-cache-request', origin)
}

function syncNavState(): void {
  const el = webviewRef.value
  if (!el) return
  try {
    canBack.value = el.canGoBack()
    canForward.value = el.canGoForward()
    loading.value = el.isLoading()
    if (!editingAddress.value) {
      const url = el.getURL()
      if (url) address.value = addressFromUrl(url)
    }
  } catch {
    // webview 尚未就绪时 API 可能抛错，忽略
  }
}

/** 空白新标签页：自动聚焦地址栏 */
function focusAddressIfBlank(): void {
  if (!isBlankUrl(props.src)) return
  nextTick(() => {
    editingAddress.value = true
    address.value = ''
    addressInputRef.value?.focus()
  })
}

function goBack(): void {
  const el = webviewRef.value
  if (el?.canGoBack()) el.goBack()
}

function goForward(): void {
  const el = webviewRef.value
  if (el?.canGoForward()) el.goForward()
}

/** 左击：加载中停止，否则普通刷新 */
function reloadOrStop(): void {
  const el = webviewRef.value
  if (!el) return
  if (el.isLoading()) el.stop()
  else el.reload()
}

/** 强制刷新（绕过 HTTP 缓存） */
function forceReload(): void {
  const el = webviewRef.value
  if (!el) return
  el.reloadIgnoringCache()
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

function onPageTitleUpdated(e: Event): void {
  const title = (e as WebviewTitleEvent).title
  if (typeof title === 'string' && title.trim() && title !== BLANK_URL) {
    emit('title-updated', title)
  }
}

/** 作废进行中的图标拉取（导航切换时） */
let faviconSeq = 0
/** 本轮导航是否已成功写入图标（避免 finish-load 再打一遍） */
let faviconReady = false

/**
 * 远程 favicon → 主进程拉成 data URL 再上报
 * 宿主 CSP 的 img-src 不含 http(s)，直接用外链地址不会发请求
 */
async function publishFavicon(url: string): Promise<void> {
  const seq = ++faviconSeq
  try {
    const dataUrl = await window.api.fetchIconDataUrl(url)
    if (seq !== faviconSeq || !dataUrl) return
    faviconReady = true
    emit('icon-updated', dataUrl)
  } catch {
    // 拉取失败保持占位
  }
}

function onPageFaviconUpdated(e: Event): void {
  const list = (e as WebviewFaviconEvent).favicons
  if (!Array.isArray(list)) return
  const icon = list.find((u) => typeof u === 'string' && u.trim() && u !== BLANK_URL)
  if (icon) void publishFavicon(icon.trim())
}

/** 事件未带 favicon 时：从页面 link / 默认 /favicon.ico 兜底 */
async function resolveFaviconFallback(el: WebviewEl): Promise<void> {
  if (faviconReady) return
  try {
    const pageUrl = el.getURL()
    if (isBlankUrl(pageUrl)) return
    const href = await el.executeJavaScript(`(() => {
      const link = document.querySelector(
        'link[rel="icon"],link[rel="shortcut icon"],link[rel~="icon"]'
      );
      if (link && link.href) return link.href;
      try { return new URL('/favicon.ico', location.href).href; } catch { return null; }
    })()`)
    if (typeof href === 'string' && href.trim()) void publishFavicon(href.trim())
  } catch {
    // guest 未就绪
  }
}

function onNavEvent(e: Event): void {
  if (e.type === 'did-start-loading' || e.type === 'did-navigate') {
    faviconSeq += 1
    faviconReady = false
  }
  if (e.type === 'did-finish-load') {
    const el = webviewRef.value
    if (el) void resolveFaviconFallback(el)
  }
  syncNavState()
}

const navEvents = [
  'did-navigate',
  'did-navigate-in-page',
  'did-start-loading',
  'did-stop-loading',
  'did-finish-load',
  'did-fail-load'
] as const

let offWindowOpen: (() => void) | null = null

function bindWebview(el: WebviewEl | null): void {
  if (!el) return
  for (const name of navEvents) {
    el.addEventListener(name, onNavEvent)
  }
  // dom-ready 后才能稳定读 URL / 历史
  el.addEventListener('dom-ready', syncNavState)
  el.addEventListener('page-title-updated', onPageTitleUpdated)
  el.addEventListener('page-favicon-updated', onPageFaviconUpdated)
  // 主进程 deny 后推送；按 guest webContentsId 匹配本实例
  offWindowOpen?.()
  offWindowOpen = window.api.onWebviewWindowOpen(({ webContentsId, url }) => {
    try {
      if (el.getWebContentsId() === webContentsId) emit('open-window', url)
    } catch {
      // webview 未就绪
    }
  })
  syncNavState()
  focusAddressIfBlank()
}

function unbindWebview(el: WebviewEl | null): void {
  if (!el) return
  for (const name of navEvents) {
    el.removeEventListener(name, onNavEvent)
  }
  el.removeEventListener('dom-ready', syncNavState)
  el.removeEventListener('page-title-updated', onPageTitleUpdated)
  el.removeEventListener('page-favicon-updated', onPageFaviconUpdated)
  offWindowOpen?.()
  offWindowOpen = null
}

watch(webviewRef, (el, prev) => {
  unbindWebview(prev)
  bindWebview(el)
})

watch(
  () => props.src,
  (src) => {
    if (!editingAddress.value) address.value = addressFromUrl(src)
    focusAddressIfBlank()
  }
)

onBeforeUnmount(() => {
  // 关页签 / 卸 webview 前先关对应开发者工具，避免独立窗残留
  const el = webviewRef.value
  if (el) {
    try {
      void window.api.closeWebviewDevTools(el.getWebContentsId())
    } catch {
      // guest 已不可用
    }
  }
  unbindWebview(el)
})
</script>

<template>
  <div class="browser">
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
        <ContextMenu>
          <ContextMenuTrigger as-child>
            <button
              type="button"
              class="nav-btn"
              :title="reloadTitle"
              :aria-label="reloadTitle"
              @click="reloadOrStop"
            >
              <RotateCw class="h-3.5 w-3.5" :class="{ spinning: loading }" />
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem class="cursor-pointer text-xs" @select="forceReload">
              强制刷新
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        <button
          type="button"
          class="nav-btn"
          title="清除此网站数据"
          aria-label="清除此网站数据"
          :disabled="!clearableOrigin"
          @click="requestClearCache"
        >
          <Eraser class="h-3.5 w-3.5" />
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
          placeholder="输入网址后回车"
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
      <!-- allowpopups：否则 window.open / target=_blank 不会走到主进程 handler -->
      <webview
        ref="webviewRef"
        class="project-webview"
        :src="src"
        allowpopups
        :partition="PROJECTS_PREVIEW_PARTITION"
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
