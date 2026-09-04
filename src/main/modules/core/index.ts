/** 通用能力模块：窗口、快捷键、托盘、存储、通用 IPC */
export { WindowManager } from './windowManager'
export { ShortcutManager, normalizeAccelerator } from './shortcutManager'
export { TrayManager } from './trayManager'
export { JsonStore } from './storage'
export { registerCoreIpc } from './ipc'
export type { CoreIpcDeps } from './ipc'
