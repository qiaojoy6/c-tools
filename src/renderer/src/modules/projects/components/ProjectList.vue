<script setup lang="ts">
import type { ScannedProject } from '@shared/types'
import { FolderOpen, Pencil, RefreshCw, Trash2 } from 'lucide-vue-next'
import { Button } from '@renderer/components/ui/button'
import { Switch } from '@renderer/components/ui/switch'
import ProjectIcon from './ProjectIcon.vue'

defineProps<{
  workspaceRoot: string | null
  projects: ScannedProject[]
  runningIds: Set<string>
  busy: boolean
}>()

const emit = defineEmits<{
  pickWorkspace: []
  openWorkspace: []
  clearWorkspace: []
  refresh: []
  edit: [project: ScannedProject]
  toggle: [folderName: string, on: boolean]
}>()
</script>

<template>
  <div class="home">
    <!-- 工作区工具栏 -->
    <div class="toolbar">
      <button
        type="button"
        class="chip chip-workspace"
        title="选择工作区根目录"
        :disabled="busy"
        @click="emit('pickWorkspace')"
      >
        工作区
      </button>
      <p class="toolbar-path" :title="workspaceRoot ?? undefined">
        {{ workspaceRoot || '点击左侧选择根目录' }}
      </p>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        class="h-8 w-8 shrink-0"
        title="打开工作区"
        :disabled="busy || !workspaceRoot"
        @click="emit('openWorkspace')"
      >
        <FolderOpen class="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        class="h-8 w-8 shrink-0"
        title="重新扫描"
        :disabled="busy || !workspaceRoot"
        @click="emit('refresh')"
      >
        <RefreshCw class="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        class="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
        title="删除工作区"
        :disabled="busy || !workspaceRoot"
        @click="emit('clearWorkspace')"
      >
        <Trash2 class="h-3.5 w-3.5" />
      </Button>
    </div>

    <!-- 项目卡片网格 -->
    <div v-if="projects.length" class="card-grid">
      <article
        v-for="p in projects"
        :key="p.folderName"
        class="card"
        :class="{ 'card-running': runningIds.has(p.folderName) }"
      >
        <div class="card-top">
          <ProjectIcon :icon-url="p.iconUrl" :name="p.displayName" :size="28" />
          <div class="card-titles">
            <button
              type="button"
              class="card-name"
              title="编辑显示名、入口、基础路径与固定端口"
              :disabled="busy"
              @click="emit('edit', p)"
            >
              <span class="card-name-text">{{ p.displayName }}</span>
              <Pencil class="card-edit h-3 w-3" />
            </button>
            <p class="card-folder" :title="p.absPath">
              {{ p.folderName === '.' ? '工作区根目录' : p.folderName }}
            </p>
          </div>
        </div>

        <dl class="card-meta">
          <div class="meta-row">
            <dt>入口</dt>
            <dd :title="p.entryPath">{{ p.entryPath }}</dd>
          </div>
          <div v-if="p.basePath" class="meta-row">
            <dt>基础路径</dt>
            <dd>{{ p.basePath }}/</dd>
          </div>
          <div v-if="p.port" class="meta-row">
            <dt>端口</dt>
            <dd class="port-fixed">:{{ p.port }}</dd>
          </div>
        </dl>

        <div class="card-footer">
          <span class="start-label">启动</span>
          <Switch
            :model-value="runningIds.has(p.folderName)"
            :disabled="busy"
            @update:model-value="(v) => emit('toggle', p.folderName, v)"
          />
        </div>
      </article>
    </div>

    <!-- 未选工作区：空白区引导 -->
    <button
      v-else-if="!workspaceRoot"
      type="button"
      class="empty-pick"
      :disabled="busy"
      @click="emit('pickWorkspace')"
    >
      <FolderOpen class="empty-pick-icon" aria-hidden="true" />
      <span class="empty-pick-title">选择工作区根目录</span>
      <span class="empty-pick-desc">
        选择存放已打包静态项目的文件夹，扫描后可在此启动预览
      </span>
    </button>

    <p v-else class="empty-hint">
      未找到静态项目。请确认目录仍存在，且满足其一：根目录有 index.html /
      dist/index.html；或一级子目录各自是已打包产物。
    </p>
  </div>
</template>

<style scoped>
.home {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  gap: 14px;
  padding: 14px 16px 20px;
  overflow: auto;
}

.toolbar {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 12px;
  min-height: 40px;
}

.chip {
  display: inline-flex;
  flex-shrink: 0;
  max-width: 140px;
  min-height: 32px;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: color-mix(in oklab, var(--muted) 35%, transparent);
  color: var(--foreground);
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 500;
  outline: none;
}

.chip:focus-visible {
  box-shadow: 0 0 0 2px color-mix(in oklab, var(--ring) 45%, transparent);
}

.chip:hover:not(:disabled) {
  background: color-mix(in oklab, var(--muted) 55%, transparent);
}

.chip-workspace {
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.15s ease;
}

.chip-workspace:hover:not(:disabled) {
  border-color: color-mix(in oklab, var(--primary) 55%, var(--border));
  background: color-mix(in oklab, var(--primary) 16%, transparent);
  color: var(--foreground);
  box-shadow: 0 0 0 1px color-mix(in oklab, var(--primary) 25%, transparent);
  transform: translateY(-1px);
}

.chip-workspace:active:not(:disabled) {
  transform: translateY(0);
}

.chip:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.toolbar-path {
  margin: 0;
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--muted-foreground);
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
  align-content: start;
}

.card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: color-mix(in oklab, var(--muted) 22%, transparent);
  padding: 14px;
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    box-shadow 0.15s ease;
}

.card:hover {
  border-color: color-mix(in oklab, var(--foreground) 18%, var(--border));
  background: color-mix(in oklab, var(--muted) 38%, transparent);
}

.card-running {
  border-color: color-mix(in oklab, var(--primary) 45%, var(--border));
  box-shadow: 0 0 0 1px color-mix(in oklab, var(--primary) 18%, transparent);
}

.card-top {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  gap: 10px;
}

.card-titles {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.card-name {
  display: inline-flex;
  max-width: 100%;
  cursor: pointer;
  align-items: center;
  gap: 6px;
  border: none;
  background: transparent;
  color: var(--foreground);
  padding: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
  outline: none;
  text-align: left;
}

.card-name:focus-visible {
  border-radius: 4px;
  box-shadow: 0 0 0 2px color-mix(in oklab, var(--ring) 45%, transparent);
}

.card-name:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.card-name-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-edit {
  flex-shrink: 0;
  opacity: 0.4;
  transition: opacity 0.15s ease;
}

.card-name:hover:not(:disabled) .card-edit {
  opacity: 0.9;
}

.card-folder {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--muted-foreground);
}

.card-meta {
  display: flex;
  margin: 0;
  flex: 1;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
}

.meta-row {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
}

.meta-row dt {
  flex-shrink: 0;
  width: 52px;
  color: var(--muted-foreground);
  opacity: 0.85;
}

.meta-row dd {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--foreground);
}

.port-fixed {
  font-variant-numeric: tabular-nums;
  opacity: 0.9;
}

.card-footer {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-top: 1px solid color-mix(in oklab, var(--border) 85%, transparent);
  padding-top: 10px;
}

.start-label {
  font-size: 12px;
  color: var(--muted-foreground);
}

.empty-hint {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--muted-foreground);
}

.empty-pick {
  display: flex;
  min-height: 180px;
  flex: 1;
  cursor: pointer;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px dashed color-mix(in oklab, var(--border) 90%, var(--foreground));
  border-radius: 12px;
  background: color-mix(in oklab, var(--muted) 22%, transparent);
  color: var(--muted-foreground);
  margin-top: 4px;
  padding: 24px 20px;
  outline: none;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}

.empty-pick:hover:not(:disabled) {
  border-color: color-mix(in oklab, var(--primary) 45%, var(--border));
  background: color-mix(in oklab, var(--primary) 8%, transparent);
  color: var(--foreground);
}

.empty-pick:focus-visible {
  box-shadow: 0 0 0 2px color-mix(in oklab, var(--ring) 45%, transparent);
}

.empty-pick:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.empty-pick-icon {
  width: 28px;
  height: 28px;
  opacity: 0.75;
}

.empty-pick-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--foreground);
}

.empty-pick-desc {
  max-width: 280px;
  text-align: center;
  font-size: 12px;
  line-height: 1.45;
  color: var(--muted-foreground);
}
</style>
