<script setup lang="ts">
import type { QuickFolderItem } from '@shared/types'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useQuickFolders } from '@renderer/modules/quickFolders/composables/useQuickFolders'
import { primaryLabel } from '@renderer/modules/quickFolders/label'
import QuickFoldersToolbar from '@renderer/modules/quickFolders/components/QuickFoldersToolbar.vue'
import QuickFolderList from '@renderer/modules/quickFolders/components/QuickFolderList.vue'
import QuickFolderFormDialog from '@renderer/modules/quickFolders/components/QuickFolderFormDialog.vue'
import QuickFolderDeleteDialog from '@renderer/modules/quickFolders/components/QuickFolderDeleteDialog.vue'

const route = useRoute()
/** 仅独立浮层 ESC 关窗；面板内嵌时 ESC 只清搜索 / 关对话框 */
const escToClose = computed(() => route.name === 'quick-folders')

const { items, refresh, add, update, remove, reorder, pickDirectory, open } = useQuickFolders()

const search = ref('')
const highlight = ref(0)
const toastMsg = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null
let offShown: (() => void) | null = null

const toolbar = ref<{ focusInput: () => void; blurInput: () => void } | null>(null)
const formDialog = ref<{
  setError: (message: string) => void
  setBusy: (busy: boolean) => void
  setPath: (path: string) => void
  close: () => void
} | null>(null)

const dialogOpen = ref(false)
const dialogMode = ref<'add' | 'edit'>('add')
const editingId = ref<string | null>(null)
const formInitialPath = ref('')
const formInitialNote = ref('')

/** 删除二次确认 */
const deleteOpen = ref(false)
const pendingDelete = ref<QuickFolderItem | null>(null)

const filtered = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  if (!keyword) return items.value
  return items.value.filter((item) => {
    const label = primaryLabel(item).toLowerCase()
    return label.includes(keyword) || item.path.toLowerCase().includes(keyword)
  })
})

watch(search, () => {
  highlight.value = 0
})

watch(
  () => filtered.value.length,
  (len) => {
    if (highlight.value >= len) highlight.value = Math.max(0, len - 1)
  }
)

function showToast(message: string): void {
  toastMsg.value = message
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toastMsg.value = ''), 1800)
}

function hideFloat(): void {
  window.api.hidePanel()
}

function move(delta: number): void {
  const len = filtered.value.length
  if (len === 0) return
  highlight.value = (highlight.value + delta + len) % len
}

function openAdd(): void {
  dialogMode.value = 'add'
  editingId.value = null
  formInitialPath.value = ''
  formInitialNote.value = ''
  dialogOpen.value = true
}

function openEdit(item: QuickFolderItem): void {
  if (!item.valid) return
  dialogMode.value = 'edit'
  editingId.value = item.id
  formInitialPath.value = item.path
  formInitialNote.value = item.note
  dialogOpen.value = true
}

async function browsePath(): Promise<void> {
  const picked = await pickDirectory()
  if (picked) formDialog.value?.setPath(picked)
}

async function onSave(payload: { path: string; note: string }): Promise<void> {
  const dlg = formDialog.value
  if (!dlg) return
  try {
    if (dialogMode.value === 'add') {
      const result = await add(payload)
      if (!result.ok) {
        dlg.setError(result.error)
        return
      }
      dlg.close()
      showToast('已添加')
      return
    }
    const id = editingId.value
    if (!id) {
      dlg.setBusy(false)
      return
    }
    const result = await update(id, payload)
    if (!result.ok) {
      dlg.setError(result.error)
      return
    }
    dlg.close()
    showToast('已更新')
  } catch {
    dlg.setError('保存失败')
  }
}

async function openItem(item: QuickFolderItem): Promise<void> {
  if (!item.valid) {
    showToast('路径无效，只能删除')
    return
  }
  const ok = await open(item.id)
  if (!ok) {
    showToast('打开失败')
    await refresh()
    return
  }
  if (escToClose.value) hideFloat()
}

async function openCurrent(): Promise<void> {
  const item = filtered.value[highlight.value]
  if (!item) return
  await openItem(item)
}

/** 弹出删除确认（按钮 / ⌫ 共用） */
function askRemove(item: QuickFolderItem): void {
  pendingDelete.value = item
  deleteOpen.value = true
}

function askRemoveCurrent(): void {
  const item = filtered.value[highlight.value]
  if (!item) return
  askRemove(item)
}

async function confirmRemove(): Promise<void> {
  const item = pendingDelete.value
  deleteOpen.value = false
  pendingDelete.value = null
  if (!item) return
  await remove(item.id)
  showToast('已删除')
}

async function onReorder(from: number, to: number): Promise<void> {
  const next = [...items.value]
  const [moved] = next.splice(from, 1)
  if (!moved) return
  next.splice(to, 0, moved)
  const ok = await reorder(next.map((r) => r.id))
  if (!ok) {
    showToast('排序失败')
    await refresh()
  }
}

function isTypingTarget(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null
  return el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA'
}

function onKeydown(e: KeyboardEvent): void {
  if (dialogOpen.value || deleteOpen.value) return
  if (e.isComposing || e.keyCode === 229) return

  if (e.key === 'Escape') {
    e.preventDefault()
    if (search.value) {
      search.value = ''
      toolbar.value?.blurInput()
    } else if (escToClose.value) {
      hideFloat()
    }
    return
  }

  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
    e.preventDefault()
    toolbar.value?.focusInput()
    return
  }

  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
    e.preventDefault()
    openAdd()
    return
  }

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      move(1)
      return
    case 'ArrowUp':
      e.preventDefault()
      move(-1)
      return
    case 'Tab':
      e.preventDefault()
      move(e.shiftKey ? -1 : 1)
      return
  }

  if (!isTypingTarget(e) && !e.metaKey && !e.ctrlKey && !e.altKey && /^[a-zA-Z0-9]$/.test(e.key)) {
    e.preventDefault()
    search.value += e.key
    toolbar.value?.focusInput()
    return
  }

  switch (e.key) {
    case 'Enter':
      e.preventDefault()
      void openCurrent()
      break
    case 'Delete':
    case 'Backspace':
      if (isTypingTarget(e)) return
      e.preventDefault()
      askRemoveCurrent()
      break
  }
}

onMounted(() => {
  offShown = window.api.onPanelShown(() => {
    search.value = ''
    highlight.value = 0
    dialogOpen.value = false
    deleteOpen.value = false
    pendingDelete.value = null
    void refresh()
    nextTick(() => toolbar.value?.blurInput())
  })
  window.addEventListener('keydown', onKeydown, true)
})

onUnmounted(() => {
  offShown?.()
  window.removeEventListener('keydown', onKeydown, true)
  if (toastTimer) clearTimeout(toastTimer)
})
</script>

<template>
  <div class="page">
    <QuickFoldersToolbar ref="toolbar" v-model:search="search" @add="openAdd" />

    <QuickFolderList
      v-model:highlight="highlight"
      :items="filtered"
      :drag-disabled="Boolean(search.trim())"
      :empty-search="Boolean(search.trim())"
      @open="void openItem($event)"
      @edit="openEdit"
      @remove="askRemove"
      @reorder="(from, to) => void onReorder(from, to)"
    />

    <footer class="footer">
      <span class="count">{{ filtered.length }} 条</span>
      <div class="hints">
        <span class="hint"><kbd class="kbd">↵</kbd> 打开</span>
        <span class="hint"><kbd class="kbd">⌘N</kbd> 添加</span>
        <span class="hint"><kbd class="kbd">⌫</kbd> 删除</span>
      </div>
    </footer>

    <QuickFolderFormDialog
      ref="formDialog"
      v-model:open="dialogOpen"
      :mode="dialogMode"
      :initial-path="formInitialPath"
      :initial-note="formInitialNote"
      @browse="void browsePath()"
      @save="void onSave($event)"
    />

    <QuickFolderDeleteDialog
      v-model:open="deleteOpen"
      :item="pendingDelete"
      @confirm="void confirmRemove()"
    />

    <Transition name="toast">
      <div v-if="toastMsg" class="toast-wrap">
        <div class="toast">{{ toastMsg }}</div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  height: 100%;
  flex-direction: column;
  overflow: hidden;
  background: color-mix(in oklab, var(--card) 88%, transparent);
  color: var(--foreground);
  backdrop-filter: blur(24px);
}

.footer {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-top: 1px solid color-mix(in oklab, var(--border) 50%, transparent);
  padding: 8px 14px;
  font-size: 11px;
  color: var(--muted-foreground);
}

.count {
  flex-shrink: 0;
}

.hints {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.kbd {
  border-radius: 4px;
  background: color-mix(in oklab, var(--muted) 70%, transparent);
  padding: 1px 5px;
  font-family: inherit;
  font-size: 10px;
  color: var(--muted-foreground);
}

.toast-wrap {
  pointer-events: none;
  position: fixed;
  inset-inline: 0;
  top: 16px;
  z-index: 50;
  display: flex;
  justify-content: center;
}

.toast {
  border-radius: 999px;
  background: var(--primary);
  padding: 6px 16px;
  font-size: 12px;
  font-weight: 500;
  color: var(--primary-foreground);
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / 20%);
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
