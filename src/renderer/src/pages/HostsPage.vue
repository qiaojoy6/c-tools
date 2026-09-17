<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { Plus, RefreshCw } from 'lucide-vue-next'
import type { HostsScheme } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { useHosts } from '@renderer/modules/hosts/composables/useHosts'
import HostsSchemeRow from '@renderer/modules/hosts/components/HostsSchemeRow.vue'
import HostsNameDialog from '@renderer/modules/hosts/components/HostsNameDialog.vue'
import HostsCodeEditor from '@renderer/modules/hosts/components/HostsCodeEditor.vue'

/** 系统 hosts 预览 Tab（固定首位，不进 schemes、不可拖） */
const SYSTEM_PREVIEW_ID = '__system_preview__'

const { schemes, authSession, add, rename, setContent, setEnabled, remove, reorder, readSystem } =
  useHosts()

const activeId = ref<string>(SYSTEM_PREVIEW_ID)
const draft = ref('')
const systemPath = ref('')
const busy = ref(false)
const toastMsg = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null
/** 到期后本地切到「需重新授权」（主进程只下发 expiresAt） */
const nowMs = ref(Date.now())
let expireTimer: ReturnType<typeof setTimeout> | null = null

const nameOpen = ref(false)
const nameMode = ref<'add' | 'rename'>('add')
const nameError = ref('')
const renamingId = ref<string | null>(null)

const dragFrom = ref<number | null>(null)
const dragOver = ref<number | null>(null)

const isPreview = computed(() => activeId.value === SYSTEM_PREVIEW_ID)
const active = computed(() =>
  isPreview.value ? null : (schemes.value.find((s) => s.id === activeId.value) ?? null)
)

/** 下次需输入密码 / 系统授权的提示 */
const authHint = computed(() => {
  const expiresAt = authSession.value.expiresAt
  if (!expiresAt || expiresAt <= nowMs.value) {
    return '下次写入系统需重新授权'
  }
  const time = new Date(expiresAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })
  return `免密至 ${time}`
})

function clearExpireTimer(): void {
  if (expireTimer) {
    clearTimeout(expireTimer)
    expireTimer = null
  }
}

function syncExpireTimer(): void {
  clearExpireTimer()
  nowMs.value = Date.now()
  const expiresAt = authSession.value.expiresAt
  if (!expiresAt || expiresAt <= nowMs.value) return
  expireTimer = setTimeout(() => {
    nowMs.value = Date.now()
    expireTimer = null
  }, expiresAt - nowMs.value)
}

watch(
  () => authSession.value.expiresAt,
  () => syncExpireTimer(),
  { immediate: true }
)

onUnmounted(() => {
  clearExpireTimer()
})

/** 拉取系统 hosts 原文到预览区 */
async function loadSystemHosts(): Promise<void> {
  const res = await readSystem()
  if (!res.ok) {
    draft.value = ''
    systemPath.value = ''
    showToast(res.error)
    return
  }
  draft.value = res.content
  systemPath.value = res.path
}

onMounted(() => {
  void loadSystemHosts()
})

watch(
  schemes,
  (list) => {
    // 预览 Tab 始终有效；方案被删时回落到预览
    if (isPreview.value) return
    if (!list.some((s) => s.id === activeId.value)) {
      activeId.value = SYSTEM_PREVIEW_ID
      void loadSystemHosts()
    }
  },
  { deep: true }
)

watch(activeId, (id, prev) => {
  if (id === prev) return
  if (id === SYSTEM_PREVIEW_ID) {
    void loadSystemHosts()
    return
  }
  const s = schemes.value.find((x) => x.id === id)
  draft.value = s?.content ?? ''
})

/** 写入系统后若正在预览则刷新 */
function refreshPreviewIfNeeded(): void {
  if (isPreview.value) void loadSystemHosts()
}

function showToast(message: string): void {
  toastMsg.value = message
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toastMsg.value = ''), 2200)
}

function selectPreview(): void {
  activeId.value = SYSTEM_PREVIEW_ID
}

function select(scheme: HostsScheme): void {
  activeId.value = scheme.id
}

async function onBlurSave(): Promise<void> {
  if (isPreview.value) return
  const s = active.value
  if (!s || busy.value) return
  if (draft.value === s.content) return
  busy.value = true
  try {
    const res = await setContent(s.id, draft.value)
    if (!res.ok) showToast(res.error)
    else if (s.enabled) refreshPreviewIfNeeded()
  } finally {
    busy.value = false
  }
}

async function onToggle(scheme: HostsScheme, enabled: boolean): Promise<void> {
  if (busy.value) return
  // 切换前若当前正在编辑该条，先落盘内容
  if (activeId.value === scheme.id && draft.value !== scheme.content) {
    busy.value = true
    try {
      const saveRes = await setContent(scheme.id, draft.value)
      if (!saveRes.ok) {
        showToast(saveRes.error)
        return
      }
    } finally {
      busy.value = false
    }
  }
  busy.value = true
  try {
    const res = await setEnabled(scheme.id, enabled)
    if (!res.ok) showToast(res.error)
    else refreshPreviewIfNeeded()
  } finally {
    busy.value = false
  }
}

function openAdd(): void {
  nameMode.value = 'add'
  renamingId.value = null
  nameError.value = ''
  nameOpen.value = true
}

function openRename(scheme: HostsScheme): void {
  nameMode.value = 'rename'
  renamingId.value = scheme.id
  nameError.value = ''
  nameOpen.value = true
}

async function onNameSubmit(name: string): Promise<void> {
  if (!name || busy.value) return
  busy.value = true
  nameError.value = ''
  try {
    if (nameMode.value === 'add') {
      const res = await add(name)
      if (!res.ok) {
        nameError.value = res.error
        return
      }
      nameOpen.value = false
      const created = res.schemes[res.schemes.length - 1]
      if (created) {
        activeId.value = created.id
        await nextTick()
        draft.value = created.content
      }
    } else if (renamingId.value) {
      const res = await rename(renamingId.value, name)
      if (!res.ok) {
        nameError.value = res.error
        return
      }
      nameOpen.value = false
    }
  } finally {
    busy.value = false
  }
}

async function onRemove(scheme: HostsScheme): Promise<void> {
  if (scheme.enabled) {
    showToast('请先关闭开关再删除')
    return
  }
  if (busy.value) return
  busy.value = true
  try {
    const res = await remove(scheme.id)
    if (!res.ok) showToast(res.error)
  } finally {
    busy.value = false
  }
}

function onDragStart(index: number, e: DragEvent): void {
  dragFrom.value = index
  e.dataTransfer?.setData('text/plain', String(index))
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onDragOver(index: number, e: DragEvent): void {
  e.preventDefault()
  dragOver.value = index
}

async function onDrop(index: number, e: DragEvent): Promise<void> {
  e.preventDefault()
  const from = dragFrom.value
  dragFrom.value = null
  dragOver.value = null
  if (from === null || from === index || busy.value) return
  const ids = schemes.value.map((s) => s.id)
  const [moved] = ids.splice(from, 1)
  if (!moved) return
  ids.splice(index, 0, moved)
  busy.value = true
  try {
    const res = await reorder(ids)
    if (!res.ok) showToast(res.error)
    else refreshPreviewIfNeeded()
  } finally {
    busy.value = false
  }
}

function onDragEnd(): void {
  dragFrom.value = null
  dragOver.value = null
}
</script>

<template>
  <div class="hosts-page">
    <aside class="sidebar">
      <div class="sidebar-head">
        <div class="min-w-0">
          <h2 class="title">Hosts</h2>
          <p class="auth-hint">{{ authHint }}</p>
        </div>
        <Button type="button" size="sm" variant="outline" class="gap-1 shrink-0" @click="openAdd">
          <Plus class="h-3.5 w-3.5" />
          添加
        </Button>
      </div>
      <ul class="scheme-list" role="listbox" aria-label="Hosts 方案">
        <!-- 系统预览：固定首位，不可拖拽 -->
        <li
          class="preview-row"
          :class="{ active: isPreview }"
          role="option"
          :aria-selected="isPreview"
          @click="selectPreview"
        >
          <div class="meta min-w-0 flex-1 flex justify-between">
            <p class="name truncate">系统 hosts</p>
            <p class="hint">只读预览</p>
          </div>
        </li>

        <HostsSchemeRow
          v-for="(scheme, index) in schemes"
          :key="scheme.id"
          :scheme="scheme"
          :active="scheme.id === activeId"
          :drag-over="dragOver === index"
          :busy="busy"
          @select="select(scheme)"
          @toggle="(v) => onToggle(scheme, v)"
          @rename="openRename(scheme)"
          @remove="onRemove(scheme)"
          @dragstart="onDragStart(index, $event)"
          @dragover="onDragOver(index, $event)"
          @drop="onDrop(index, $event)"
          @dragend="onDragEnd"
        />
      </ul>
      <p v-if="schemes.length === 0" class="empty">
        点击「添加」创建方案。开启开关后才会写入系统 hosts。
      </p>
    </aside>

    <section class="editor">
      <template v-if="isPreview">
        <div class="editor-head">
          <div class="min-w-0 flex-1">
            <h3 class="editor-title">系统 hosts</h3>
            <p class="editor-hint truncate">
              只读预览{{ systemPath ? ` · ${systemPath}` : '' }}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            class="gap-1 shrink-0"
            :disabled="busy"
            @click="void loadSystemHosts()"
          >
            <RefreshCw class="h-3.5 w-3.5" />
            刷新
          </Button>
        </div>
        <HostsCodeEditor
          :key="SYSTEM_PREVIEW_ID"
          v-model="draft"
          :scheme-id="SYSTEM_PREVIEW_ID"
          read-only
        />
      </template>
      <template v-else-if="active">
        <div class="editor-head">
          <div>
            <h3 class="editor-title">{{ active.name }}</h3>
            <p class="editor-hint">
              {{
                active.enabled
                  ? `已开启：失焦后写入本地并更新系统 · ${authHint}`
                  : '未开启：失焦仅保存到本地'
              }}
            </p>
          </div>
        </div>
        <HostsCodeEditor
          :key="active.id"
          v-model="draft"
          :scheme-id="active.id"
          @blur="onBlurSave"
        />
      </template>
      <div v-else class="editor-empty">选择或添加一个方案开始编辑</div>
    </section>

    <div v-if="toastMsg" class="toast" role="status">{{ toastMsg }}</div>

    <HostsNameDialog
      :open="nameOpen"
      :mode="nameMode"
      :initial-name="
        nameMode === 'rename'
          ? (schemes.find((s) => s.id === renamingId)?.name ?? '')
          : ''
      "
      :busy="busy"
      :error="nameError"
      @update:open="(v) => (nameOpen = v)"
      @submit="onNameSubmit"
    />
  </div>
</template>

<style scoped>
.hosts-page {
  display: flex;
  height: 100%;
  min-height: 0;
  position: relative;
}
.sidebar {
  width: 240px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0.75rem;
  gap: 0.5rem;
}
.sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.title {
  font-size: 0.875rem;
  font-weight: 600;
}
.auth-hint {
  margin-top: 0.15rem;
  font-size: 0.65rem;
  color: var(--muted-foreground);
  line-height: 1.3;
}
.scheme-list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
  min-height: 0;
}
.preview-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.54rem 0.5rem;
  border-radius: 0.5rem;
  cursor: pointer;
  border: 1px solid transparent;
  /* 与方案行区分：略偏 muted，无拖拽把手 */
  background: color-mix(in oklab, var(--muted) 40%, transparent);
}
.preview-row:hover {
  background: color-mix(in oklab, var(--muted) 70%, transparent);
}
.preview-row.active {
  background: color-mix(in oklab, var(--primary) 12%, transparent);
  border-color: color-mix(in oklab, var(--primary) 28%, transparent);
}
.preview-row .name {
  font-size: 0.8125rem;
  font-weight: 500;
  line-height: 1.2;
}
.preview-row .hint {
  margin-top: 0.1rem;
  font-size: 0.65rem;
  color: var(--muted-foreground);
}
.empty {
  font-size: 0.75rem;
  color: var(--muted-foreground);
  line-height: 1.45;
  padding: 0.5rem 0.25rem;
}
.editor {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 0.75rem 1rem 1rem;
  gap: 0.5rem;
}
.editor-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}
.editor-title {
  font-size: 0.875rem;
  font-weight: 600;
}
.editor-hint {
  margin-top: 0.15rem;
  font-size: 0.7rem;
  color: var(--muted-foreground);
}
.editor-empty {
  flex: 1;
  display: grid;
  place-items: center;
  color: var(--muted-foreground);
  font-size: 0.8125rem;
}
.toast {
  position: absolute;
  left: 50%;
  bottom: 1rem;
  transform: translateX(-50%);
  z-index: 20;
  max-width: min(90%, 24rem);
  padding: 0.45rem 0.75rem;
  border-radius: 0.5rem;
  background: var(--foreground);
  color: var(--background);
  font-size: 0.75rem;
}
</style>
