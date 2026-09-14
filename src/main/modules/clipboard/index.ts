/** 剪贴板功能模块：监听、历史、收藏、粘贴、图片存储、IPC、Feature */
export { ClipboardWatcher } from './watcher'
export { HistoryManager } from './history'
export { FavoritesManager } from './favorites'
export { PasteService } from './paste'
export {
  ClipboardImageStore,
  installClipboardImageProtocol
} from './imageStore'
export { registerClipboardIpc } from './ipc'
export type { ClipboardIpcDeps } from './ipc'
export { clipboardFeature } from './feature'
export type { ClipboardFeatureHandles } from './feature'
export type { ClipboardHostServices } from './hostServices'
export { broadcastHistory, broadcastFavorites } from './broadcast'
