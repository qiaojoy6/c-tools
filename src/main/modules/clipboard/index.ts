/** 剪贴板功能模块：监听、历史、粘贴、IPC */
export { ClipboardWatcher } from './watcher'
export { HistoryManager } from './history'
export { PasteService } from './paste'
export { registerClipboardIpc } from './ipc'
export type { ClipboardIpcDeps } from './ipc'
