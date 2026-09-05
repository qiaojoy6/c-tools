<script setup lang="ts">
import type { ScannedProject } from '@shared/types'
import { Pencil, RefreshCw } from 'lucide-vue-next'
import { Button } from '@renderer/components/ui/button'
import { Switch } from '@renderer/components/ui/switch'

defineProps<{
  workspaceRoot: string | null
  projects: ScannedProject[]
  runningIds: Set<string>
  busy: boolean
}>()

const emit = defineEmits<{
  pickWorkspace: []
  refresh: []
  edit: [project: ScannedProject]
  toggle: [folderName: string, on: boolean]
}>()
</script>

<template>
  <div class="home">
    <!-- 工作区行 -->
    <div class="row">
      <button type="button" class="chip" :disabled="busy" @click="emit('pickWorkspace')">
        工作区
      </button>
      <p class="row-mid" :title="workspaceRoot ?? undefined">
        {{ workspaceRoot || '点击左侧选择根目录' }}
      </p>
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
    </div>

    <!-- 项目行 -->
    <template v-if="projects.length">
      <div v-for="p in projects" :key="p.folderName" class="row">
        <button
          type="button"
          class="chip chip-name"
          title="编辑显示名与入口"
          :disabled="busy"
          @click="emit('edit', p)"
        >
          <span class="chip-text">{{ p.displayName }}</span>
          <Pencil class="chip-edit h-3 w-3" />
        </button>
        <p class="row-mid" :title="`${p.absPath} · ${p.entryPath}`">
          {{ p.folderName === '.' ? '工作区根目录' : p.folderName }}
          <span class="sep">·</span>
          {{ p.entryPath }}
        </p>
        <div class="start-cell">
          <span class="start-label">启动</span>
          <Switch
            :model-value="runningIds.has(p.folderName)"
            :disabled="busy"
            @update:model-value="(v) => emit('toggle', p.folderName, v)"
          />
        </div>
      </div>
    </template>

    <p v-else-if="workspaceRoot" class="empty-hint">
      未找到静态项目。请确认目录仍存在，且满足其一：根目录有 index.html /
      dist/index.html；或一级子目录各自是已打包产物。
    </p>
  </div>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px 20px;
  overflow: auto;
}

.row {
  display: flex;
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
}

.chip:hover:not(:disabled) {
  background: color-mix(in oklab, var(--muted) 55%, transparent);
}

.chip:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.chip-name {
  justify-content: flex-start;
}

.chip-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip-edit {
  flex-shrink: 0;
  opacity: 0.45;
}

.chip-name:hover .chip-edit {
  opacity: 0.9;
}

.row-mid {
  margin: 0;
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--muted-foreground);
}

.sep {
  margin: 0 4px;
  opacity: 0.5;
}

.start-cell {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 4px 10px;
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
</style>
