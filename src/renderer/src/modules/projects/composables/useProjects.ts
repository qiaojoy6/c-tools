import type { ProjectRuntimeInfo, ScannedProject } from '@shared/types'
import { ipcErrorMessage } from '@renderer/utils/ipcError'
import { computed, onMounted, ref } from 'vue'

/** 预览页签（同项目可开多个；id 唯一，folderName 关联静态服务生命周期） */
export interface ProjectTab {
  id: string
  /** 所属项目；独立浏览页签为 null（关页签不停服务） */
  folderName: string | null
  displayName: string
  /** 本页签初始加载 URL */
  url: string
  /** 项目入口预览 URL（有所属项目时有意义） */
  entryUrl: string
  iconUrl: string | null
}

/** 空白新标签页 */
const BLANK_URL = 'about:blank'
const NEW_TAB_TITLE = '新标签页'

/** 当前主视图：首页列表，或某个预览页签 id */
export type ProjectsView = 'home' | string

/** 从 URL 推导页签标题（加载后可由 page-title 覆盖） */
function titleFromUrl(url: string): string {
  if (!url || url === BLANK_URL) return NEW_TAB_TITLE
  try {
    const u = new URL(url)
    const segs = u.pathname.split('/').filter(Boolean)
    const last = segs.length ? segs[segs.length - 1]! : u.hostname
    return decodeURIComponent(last) || u.hostname || url
  } catch {
    return url
  }
}

function runtimeToTab(info: ProjectRuntimeInfo): ProjectTab {
  return {
    id: info.folderName,
    folderName: info.folderName,
    displayName: info.displayName,
    url: info.url,
    entryUrl: info.url,
    iconUrl: info.iconUrl
  }
}

/**
 * 项目模块状态：工作区、扫描列表、打开的页签
 */
export function useProjects() {
  const workspaceRoot = ref<string | null>(null)
  const projects = ref<ScannedProject[]>([])
  const tabs = ref<ProjectTab[]>([])
  const activeView = ref<ProjectsView>('home')
  const busy = ref(false)
  const errorMsg = ref('')

  /** 至少有一个项目页签的项目视为运行中（首页 Switch；不含独立浏览页签） */
  const runningIds = computed(
    () => new Set(tabs.value.map((t) => t.folderName).filter((id): id is string => Boolean(id)))
  )

  async function hydrate(): Promise<void> {
    const cfg = await window.api.getConfig()
    workspaceRoot.value = cfg.projects.workspaceRoot
    projects.value = await window.api.scanProjects()
    const running = await window.api.listRunningProjects()
    if (running.length && !tabs.value.length) {
      tabs.value = running.map(runtimeToTab)
    }
  }

  async function pickWorkspace(): Promise<void> {
    errorMsg.value = ''
    const path = await window.api.pickWorkspace()
    if (!path) return
    busy.value = true
    try {
      projects.value = await window.api.setWorkspace(path)
      workspaceRoot.value = path
    } catch (err) {
      errorMsg.value = ipcErrorMessage(err, '设置工作区失败')
    } finally {
      busy.value = false
    }
  }

  async function refreshScan(): Promise<void> {
    errorMsg.value = ''
    busy.value = true
    try {
      projects.value = await window.api.scanProjects()
    } catch (err) {
      errorMsg.value = ipcErrorMessage(err, '扫描失败')
    } finally {
      busy.value = false
    }
  }

  /** 在 Finder / 资源管理器中打开工作区 */
  async function openWorkspace(): Promise<void> {
    errorMsg.value = ''
    if (!workspaceRoot.value) return
    const ok = await window.api.openWorkspace()
    if (!ok) errorMsg.value = '无法打开工作区目录'
  }

  /** 清除工作区配置（不停磁盘文件；会停掉已启动预览） */
  async function clearWorkspace(): Promise<void> {
    errorMsg.value = ''
    if (!workspaceRoot.value) return
    busy.value = true
    try {
      const folderNames = [
        ...new Set(tabs.value.map((t) => t.folderName).filter((id): id is string => Boolean(id)))
      ]
      await Promise.all(folderNames.map((name) => window.api.stopProject(name)))
      tabs.value = []
      activeView.value = 'home'
      projects.value = await window.api.setWorkspace(null)
      workspaceRoot.value = null
    } catch (err) {
      errorMsg.value = ipcErrorMessage(err, '清除工作区失败')
    } finally {
      busy.value = false
    }
  }

  async function saveOverride(
    folderName: string,
    displayName: string,
    entryPath: string,
    basePath: string,
    /** 空 / 0 清固定端口；数字或原始字符串交给主进程校验占用与范围 */
    port?: number | string | null
  ): Promise<void> {
    try {
      const portPatch =
        port === null || port === undefined || port === '' || port === 0 ? 0 : port
      projects.value = await window.api.updateProjectOverride(folderName, {
        displayName,
        entryPath,
        basePath,
        port: portPatch
      })
    } catch (err) {
      // 由编辑弹窗内展示；剥离 Electron invoke 包装前缀
      throw new Error(ipcErrorMessage(err, '保存项目配置失败'))
    }
  }

  /** 打开项目主页签并切到该预览（同项目已有页签则切到第一个） */
  async function start(folderName: string): Promise<void> {
    errorMsg.value = ''
    const existing = tabs.value.find((t) => t.folderName === folderName)
    if (existing) {
      activeView.value = existing.id
      return
    }
    busy.value = true
    try {
      const info = await window.api.startProject(folderName)
      const tab = runtimeToTab(info)
      tabs.value = [...tabs.value, tab]
      activeView.value = tab.id
    } catch (err) {
      errorMsg.value = ipcErrorMessage(err, '启动失败')
    } finally {
      busy.value = false
    }
  }

  /**
   * webview 内 target=_blank / window.open：同项目新开页签（不另起服务）
   */
  function openChildTab(parentTabId: string, url: string): void {
    const parent = tabs.value.find((t) => t.id === parentTabId)
    if (!parent || !url) return
    const tab: ProjectTab = {
      id: crypto.randomUUID(),
      folderName: parent.folderName,
      displayName: titleFromUrl(url),
      url,
      entryUrl: parent.entryUrl,
      iconUrl: null
    }
    tabs.value = [...tabs.value, tab]
    activeView.value = tab.id
  }

  /**
   * 手动新开空白页签，在地址栏输入网址后回车访问
   * 若当前在某项目页签上，继承其 folderName（仅作关联，不另起服务）
   */
  function openNewTab(): void {
    const current = tabs.value.find((t) => t.id === activeView.value)
    const tab: ProjectTab = {
      id: crypto.randomUUID(),
      folderName: current?.folderName ?? null,
      displayName: NEW_TAB_TITLE,
      url: BLANK_URL,
      entryUrl: current?.entryUrl ?? BLANK_URL,
      // 空白页不沿用上一页项目图标，用首字占位
      iconUrl: null
    }
    tabs.value = [...tabs.value, tab]
    activeView.value = tab.id
  }

  /** 页签标题随页面 title 更新（空 / about:blank 忽略） */
  function updateTabTitle(tabId: string, title: string): void {
    const next = title.trim()
    if (!next || next === BLANK_URL) return
    tabs.value = tabs.value.map((t) => (t.id === tabId ? { ...t, displayName: next } : t))
  }

  /** 页签图标随 page-favicon-updated 更新 */
  function updateTabIcon(tabId: string, iconUrl: string): void {
    const next = iconUrl.trim()
    if (!next) return
    tabs.value = tabs.value.map((t) => (t.id === tabId ? { ...t, iconUrl: next } : t))
  }

  /** 关单个页签；该项目已无页签时停服务 */
  async function closeTab(tabId: string): Promise<void> {
    const tab = tabs.value.find((t) => t.id === tabId)
    if (!tab) return
    const { folderName } = tab
    const remaining = tabs.value.filter((t) => t.id !== tabId)
    tabs.value = remaining
    if (activeView.value === tabId) {
      const sibling = folderName
        ? remaining.find((t) => t.folderName === folderName)
        : undefined
      activeView.value = sibling?.id ?? remaining[remaining.length - 1]?.id ?? 'home'
    }
    if (folderName && !remaining.some((t) => t.folderName === folderName)) {
      await window.api.stopProject(folderName)
    }
  }

  /** 关闭某项目下全部页签并停服务 */
  async function closeProject(folderName: string): Promise<void> {
    const remaining = tabs.value.filter((t) => t.folderName !== folderName)
    const closedActive = tabs.value.some(
      (t) => t.folderName === folderName && t.id === activeView.value
    )
    tabs.value = remaining
    if (closedActive) activeView.value = 'home'
    await window.api.stopProject(folderName)
  }

  /** 首页 Switch：开=启动并跳页签；关=停服务并关该项目全部页签 */
  async function setRunning(folderName: string, on: boolean): Promise<void> {
    if (on) await start(folderName)
    else await closeProject(folderName)
  }

  onMounted(() => {
    void hydrate()
  })

  return {
    workspaceRoot,
    projects,
    tabs,
    activeView,
    runningIds,
    busy,
    errorMsg,
    pickWorkspace,
    refreshScan,
    openWorkspace,
    clearWorkspace,
    saveOverride,
    start,
    openChildTab,
    openNewTab,
    updateTabTitle,
    updateTabIcon,
    closeTab,
    setRunning
  }
}
