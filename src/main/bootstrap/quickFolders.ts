import type { ConfigManager } from '../config'
import { QuickFoldersStore } from '../modules/quickFolders'

/** 初始化快捷文件夹持久化 */
export function setupQuickFolders(config: ConfigManager): QuickFoldersStore {
  const store = new QuickFoldersStore(() => config.get().quickFolders.maxItems)
  store.init()
  return store
}
