import { onMounted, onUnmounted, ref } from 'vue'
import type { QuickFolderItem } from '@shared/types'

/** 快捷文件夹列表与增删改排 */
export function useQuickFolders() {
  const items = ref<QuickFolderItem[]>([])
  let offUpdated: (() => void) | null = null

  async function refresh(): Promise<void> {
    items.value = await window.api.quickFolders.list()
  }

  onMounted(() => {
    void refresh()
    offUpdated = window.api.quickFolders.onUpdated((next) => {
      items.value = next
    })
  })

  onUnmounted(() => {
    offUpdated?.()
    offUpdated = null
  })

  return {
    items,
    refresh,
    add: window.api.quickFolders.add,
    update: window.api.quickFolders.update,
    remove: window.api.quickFolders.remove,
    reorder: window.api.quickFolders.reorder,
    pickDirectory: window.api.quickFolders.pickDirectory,
    open: window.api.quickFolders.open
  }
}
