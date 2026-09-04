import { onMounted, onUnmounted, ref } from 'vue'
import type { ClipRecord } from '@shared/types'

/**
 * 剪贴历史 + 收藏：与主进程保持实时同步
 */
export function useHistory() {
  const records = ref<ClipRecord[]>([])
  const favorites = ref<ClipRecord[]>([])
  let offHistory: (() => void) | null = null
  let offFavorites: (() => void) | null = null

  async function refresh(): Promise<void> {
    const [historyList, favoriteList] = await Promise.all([
      window.api.listHistory(),
      window.api.listFavorites()
    ])
    records.value = historyList
    favorites.value = favoriteList
  }

  async function remove(id: string): Promise<void> {
    await window.api.removeHistory(id)
  }

  async function clear(): Promise<void> {
    await window.api.clearHistory()
  }

  /** 收藏：从历史拷贝；已存在相同内容返回 false */
  async function addFavorite(historyId: string): Promise<boolean> {
    return window.api.addFavorite(historyId)
  }

  /** 取消收藏 = 删除该收藏条 */
  async function removeFavorite(id: string): Promise<void> {
    await window.api.removeFavorite(id)
  }

  async function paste(ids: string[]): Promise<boolean> {
    return window.api.pasteItems(ids)
  }

  onMounted(async () => {
    await refresh()
    offHistory = window.api.onHistoryUpdated((list) => {
      records.value = list
    })
    offFavorites = window.api.onFavoritesUpdated((list) => {
      favorites.value = list
    })
  })

  onUnmounted(() => {
    offHistory?.()
    offFavorites?.()
  })

  return { records, favorites, refresh, remove, clear, addFavorite, removeFavorite, paste }
}
