/** 通用能力模块：窗口、快捷键、托盘、存储、通用 IPC */
export { WindowManager, ClipboardWindow, PanelWindow, SettingsWindow } from './windows'
export { ShortcutManager, normalizeAccelerator } from './shortcutManager'
export { TrayManager } from './trayManager'
export { setupAppMenu } from './appMenu'
export { JsonStore } from './storage'
export { registerCoreIpc } from './ipc'
export type { CoreIpcDeps } from './ipc'
