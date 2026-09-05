import type { ProjectRuntimeInfo, ScannedProject } from '@shared/types'
import { computed, onMounted, ref } from 'vue'

/** 打开的预览页签 */
export interface ProjectTab extends ProjectRuntimeInfo {}

/** 当前主视图：首页列表，或某个已启动项目的 folderName */
export type ProjectsView = 'home' | string

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

  const runningIds = computed(() => new Set(tabs.value.map((t) => t.folderName)))

  async function hydrate(): Promise<void> {
    const cfg = await window.api.getConfig()
    workspaceRoot.value = cfg.projects.workspaceRoot
    projects.value = await window.api.scanProjects()
    const running = await window.api.listRunningProjects()
    if (running.length && !tabs.value.length) {
      tabs.value = running.map((r) => ({ ...r }))
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
      errorMsg.value = err instanceof Error ? err.message : '设置工作区失败'
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
      errorMsg.value = err instanceof Error ? err.message : '扫描失败'
    } finally {
      busy.value = false
    }
  }

  async function saveOverride(
    folderName: string,
    displayName: string,
    entryPath: string
  ): Promise<void> {
    errorMsg.value = ''
    projects.value = await window.api.updateProjectOverride(folderName, {
      displayName,
      entryPath
    })
  }

  /** 打开页签并切到该预览 */
  async function start(folderName: string): Promise<void> {
    errorMsg.value = ''
    const existing = tabs.value.find((t) => t.folderName === folderName)
    if (existing) {
      activeView.value = folderName
      return
    }
    busy.value = true
    try {
      const info = await window.api.startProject(folderName)
      tabs.value = [...tabs.value, info]
      activeView.value = info.folderName
    } catch (err) {
      errorMsg.value = err instanceof Error ? err.message : '启动失败'
    } finally {
      busy.value = false
    }
  }

  /** 关页签并停服务；若正在看该页则回首页 */
  async function closeTab(folderName: string): Promise<void> {
    await window.api.stopProject(folderName)
    tabs.value = tabs.value.filter((t) => t.folderName !== folderName)
    if (activeView.value === folderName) {
      activeView.value = 'home'
    }
  }

  /** 首页 Switch：开=启动并跳页签；关=停服务并关页签 */
  async function setRunning(folderName: string, on: boolean): Promise<void> {
    if (on) await start(folderName)
    else await closeTab(folderName)
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
    saveOverride,
    start,
    closeTab,
    setRunning
  }
}
