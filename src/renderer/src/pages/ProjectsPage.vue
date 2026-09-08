<script setup lang="ts">
import type { ClearPreviewCacheOptions, ScannedProject } from '@shared/types'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle
} from '@renderer/components/ui/drawer'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import ClearPreviewDataDialog from '@renderer/modules/projects/components/ClearPreviewDataDialog.vue'
import ProjectList from '@renderer/modules/projects/components/ProjectList.vue'
import ProjectTabs from '@renderer/modules/projects/components/ProjectTabs.vue'
import ProjectWebview from '@renderer/modules/projects/components/ProjectWebview.vue'
import { useProjects } from '@renderer/modules/projects/composables/useProjects'

/** 功能面板「项目」：首页列表 + 横向页签预览（对齐线框） */
const {
  workspaceRoot,
  projects,
  tabs,
  activeView,
  runningIds,
  busy,
  errorMsg,
  pickWorkspace,
  openWorkspace,
  clearWorkspace,
  refreshScan,
  saveOverride,
  closeTab,
  setRunning,
  openChildTab,
  openNewTab,
  updateTabTitle,
  updateTabIcon
} = useProjects()

const editing = ref<ScannedProject | null>(null)
const editName = ref('')
const editEntry = ref('')
const editBase = ref('')
const editPort = ref('')
/** 编辑 Drawer 内错误（端口占用等，不放到页面顶栏） */
const editError = ref('')
/** 保存中：避免重复提交 */
const editSaving = ref(false)
/** 清缓存过程中先卸掉全部预览 webview，避免分区仍被占用时原生崩溃 */
const previewMounted = ref(true)
const previewEpoch = ref(0)
const clearingPreviewCache = ref(false)
const clearDataOpen = ref(false)
/** 待清除的当前页 origin */
const clearTargetOrigin = ref<string | null>(null)
/** 本次清除选项（用于进行中文案） */
const clearingOptions = ref<ClearPreviewCacheOptions | null>(null)

/** 操作失败提示弹窗（启动失败 / 端口占用等） */
const alertOpen = computed({
  get: () => Boolean(errorMsg.value),
  set: (open: boolean) => {
    if (!open) errorMsg.value = ''
  }
})

const clearingStatusText = computed(() => {
  const o = clearingOptions.value
  if (!o) return '正在清除浏览数据…'
  const parts: string[] = []
  if (o.cache) parts.push('缓存')
  if (o.cookies) parts.push('Cookie')
  if (o.localStorage) parts.push('本地存储')
  if (o.indexedDB) parts.push('IndexedDB')
  if (o.serviceWorkers) parts.push('Service Worker')
  const scope = o.all ? '（全部预览）' : o.origin ? `（${o.origin}）` : ''
  return parts.length ? `正在清除${parts.join('、')}${scope}…` : `正在清除浏览数据${scope}…`
})

watch(editing, (p) => {
  if (!p) return
  editError.value = ''
  editName.value = p.displayName
  editEntry.value = p.entryPath
  editBase.value = p.basePath || ''
  editPort.value = p.port ? String(p.port) : ''
})

let offPrepare: (() => void) | null = null
let offDone: (() => void) | null = null

onMounted(() => {
  // 设置页整分区清除时也会广播，先卸 webview 再挂回
  offPrepare = window.api.onPreviewCachePrepare(() => {
    previewMounted.value = false
    clearingPreviewCache.value = true
  })
  offDone = window.api.onPreviewCacheDone(() => {
    previewEpoch.value += 1
    previewMounted.value = true
    clearingPreviewCache.value = false
    clearingOptions.value = null
    clearTargetOrigin.value = null
  })
})

onUnmounted(() => {
  offPrepare?.()
  offDone?.()
})

function openEdit(project: ScannedProject): void {
  editing.value = project
}

function openClearDataDialog(origin: string): void {
  if (clearingPreviewCache.value || !origin) return
  clearTargetOrigin.value = origin
  clearDataOpen.value = true
}

/**
 * 确认清除：主进程会广播 prepare/done；此处先卸 webview 并调用 IPC
 */
async function confirmClearPreviewData(options: ClearPreviewCacheOptions): Promise<void> {
  if (clearingPreviewCache.value) return
  const origin = options.origin || clearTargetOrigin.value
  if (!origin) return
  clearDataOpen.value = false
  clearingOptions.value = { ...options, origin }
  clearingPreviewCache.value = true
  previewMounted.value = false
  await nextTick()
  await new Promise<void>((r) => requestAnimationFrame(() => r()))
  try {
    await window.api.clearPreviewCache({ ...options, origin })
  } catch {
    // ignore；done 事件仍会挂回
  }
}

/** 编辑 Drawer：忽略点遮罩关闭，其它原因（取消 / Esc / 滑动）照常关 */
function onEditDrawerOpen(open: boolean, details?: { reason?: string }): void {
  if (!open && details?.reason === 'outside-press') return
  if (!open) editing.value = null
}

async function confirmEdit(): Promise<void> {
  if (!editing.value || editSaving.value) return
  editError.value = ''
  editSaving.value = true
  try {
    // 端口格式 / 范围 / 占用一律由主进程 updateOverride 校验
    await saveOverride(
      editing.value.folderName,
      editName.value,
      editEntry.value,
      editBase.value,
      editPort.value.trim() || 0
    )
    editing.value = null
  } catch (err) {
    editError.value = err instanceof Error ? err.message : '保存项目配置失败'
  } finally {
    editSaving.value = false
  }
}
</script>

<template>
  <div class="projects-page">
    <ProjectTabs
      :tabs="tabs"
      :active-view="activeView"
      @select="(v) => (activeView = v)"
      @close="closeTab"
      @add="openNewTab"
    />

    <!-- 首页：工作区 + 项目列表 -->
    <ProjectList
      v-show="activeView === 'home'"
      class="home-pane"
      :workspace-root="workspaceRoot"
      :projects="projects"
      :running-ids="runningIds"
      :busy="busy"
      @pick-workspace="pickWorkspace"
      @open-workspace="openWorkspace"
      @clear-workspace="clearWorkspace"
      @refresh="refreshScan"
      @edit="openEdit"
      @toggle="setRunning"
    />

    <!-- 已启动页签：全屏 webview（同项目可多页签） -->
    <div v-show="activeView !== 'home'" class="webview-host">
      <p v-if="clearingPreviewCache" class="cache-clearing">{{ clearingStatusText }}</p>
      <template v-if="previewMounted">
        <ProjectWebview
          v-for="tab in tabs"
          v-show="tab.id === activeView"
          :key="`${tab.id}-${previewEpoch}`"
          :src="tab.url"
          @open-window="(url) => openChildTab(tab.id, url)"
          @title-updated="(title) => updateTabTitle(tab.id, title)"
          @icon-updated="(icon) => updateTabIcon(tab.id, icon)"
          @clear-cache-request="openClearDataDialog"
        />
      </template>
    </div>

    <ClearPreviewDataDialog
      :open="clearDataOpen"
      :origin="clearTargetOrigin"
      :busy="clearingPreviewCache"
      @update:open="(v) => (clearDataOpen = v)"
      @confirm="confirmClearPreviewData"
    />

    <!-- 启动失败 / 工作区错误等：弹窗提示，避免顶栏看不清 -->
    <Dialog :open="alertOpen" @update:open="(v) => (alertOpen = v)">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>无法完成操作</DialogTitle>
          <DialogDescription>{{ errorMsg }}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" @click="alertOpen = false">知道了</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 编辑项目：右侧 Drawer；点遮罩不关，仅取消/保存/Esc 关闭 -->
    <Drawer
      :open="Boolean(editing)"
      swipe-direction="right"
      @update:open="onEditDrawerOpen"
    >
      <DrawerContent
        class="w-full sm:max-w-md"
        @pointer-down-outside="(e) => e.preventDefault()"
        @interact-outside="(e) => e.preventDefault()"
      >
        <DrawerHeader>
          <DrawerTitle>编辑项目</DrawerTitle>
          <DrawerDescription>文件夹：{{ editing?.folderName }}</DrawerDescription>
        </DrawerHeader>
        <div class="edit-fields">
          <label class="field">
            <span>显示名</span>
            <Input v-model="editName" placeholder="显示名称" />
          </label>
          <label class="field">
            <span>入口路径</span>
            <Input v-model="editEntry" placeholder="如 index.html 或 dist/index.html" />
          </label>
          <label class="field">
            <span>基础路径</span>
            <Input v-model="editBase" placeholder="可选，如配置文件中的 base 路径 /app/" />
          </label>
          <label class="field">
            <span>固定端口</span>
            <Input
              v-model="editPort"
              inputmode="numeric"
              placeholder="可选，如 5173；留空则每次随机"
            />
          </label>
          <p v-if="editError" class="edit-error" role="alert">{{ editError }}</p>
        </div>
        <DrawerFooter class="flex-row justify-end gap-2">
          <DrawerClose as-child>
            <Button type="button" variant="ghost" :disabled="editSaving">取消</Button>
          </DrawerClose>
          <Button type="button" :disabled="editSaving" @click="confirmEdit">
            {{ editSaving ? '保存中…' : '保存' }}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  </div>
</template>

<style scoped>
.projects-page {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}

.home-pane {
  min-height: 0;
  flex: 1;
  overflow: auto;
}

.webview-host {
  position: relative;
  min-height: 0;
  flex: 1;
  background: var(--background);
}

.cache-clearing {
  margin: 0;
  display: flex;
  height: 100%;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--muted-foreground);
}

.edit-fields {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  padding: 4px 16px 8px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--muted-foreground);
}

.edit-error {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--destructive);
}
</style>
