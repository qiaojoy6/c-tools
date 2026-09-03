import { onMounted, onUnmounted, ref } from 'vue'
import type { ClipRecord } from '@shared/types'

/**
 * 剪贴历史状态管理：与主进程保持实时同步
 */
export function useHistory() {
  const records = ref<ClipRecord[]>([])
  let offUpdated: (() => void) | null = null

  async function refresh(): Promise<void> {
    records.value = await window.api.listHistory()
  }

  async function remove(id: string): Promise<void> {
    await window.api.removeHistory(id)
  }

  async function clear(): Promise<void> {
    await window.api.clearHistory()
  }

  async function paste(ids: string[]): Promise<boolean> {
    return window.api.pasteItems(ids)
  }

  onMounted(async () => {
    await refresh()
    offUpdated = window.api.onHistoryUpdated((list) => {
      records.value = list
    })
  })

  onUnmounted(() => {
    offUpdated?.()
  })

  return { records, refresh, remove, clear, paste }
}
