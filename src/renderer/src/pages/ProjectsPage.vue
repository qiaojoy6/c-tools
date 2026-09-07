<script setup lang="ts">
import type { ScannedProject } from '@shared/types'
import { ref, watch } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
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
  setRunning
} = useProjects()

const editing = ref<ScannedProject | null>(null)
const editName = ref('')
const editEntry = ref('')
const editBase = ref('')

watch(editing, (p) => {
  if (!p) return
  editName.value = p.displayName
  editEntry.value = p.entryPath
  editBase.value = p.basePath || ''
})

function openEdit(project: ScannedProject): void {
  editing.value = project
}

async function confirmEdit(): Promise<void> {
  if (!editing.value) return
  await saveOverride(
    editing.value.folderName,
    editName.value,
    editEntry.value,
    editBase.value
  )
  editing.value = null
}
</script>

<template>
  <div class="projects-page">
    <ProjectTabs
      :tabs="tabs"
      :active-view="activeView"
      @select="(v) => (activeView = v)"
      @close="closeTab"
    />

    <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>

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

    <!-- 已启动页签：全屏 webview -->
    <div v-show="activeView !== 'home'" class="webview-host">
      <ProjectWebview
        v-for="tab in tabs"
        v-show="tab.folderName === activeView"
        :key="tab.folderName"
        :src="tab.url"
      />
    </div>

    <Dialog :open="Boolean(editing)" @update:open="(v) => !v && (editing = null)">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>编辑项目</DialogTitle>
          <DialogDescription>文件夹：{{ editing?.folderName }}</DialogDescription>
        </DialogHeader>
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
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" @click="editing = null">取消</Button>
          <Button type="button" @click="confirmEdit">保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

.error-msg {
  margin: 0;
  flex-shrink: 0;
  padding: 6px 16px 0;
  font-size: 12px;
  color: var(--destructive);
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

.edit-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 0 8px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--muted-foreground);
}
</style>
