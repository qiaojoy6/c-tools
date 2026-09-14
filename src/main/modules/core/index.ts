/** 通用能力模块：窗口、快捷键、托盘、存储、通用 IPC */
export { WindowManager } from './windows'
export { ShortcutManager, normalizeAccelerator } from './shortcutManager'
export type { ShortcutHandlers } from './shortcutManager'
export { TrayManager, trayMenuItem } from './trayManager'
export type {
  TrayShellActions,
  TrayState,
  TrayRecordingState,
  TrayContribution,
  TrayMenuContext
} from './trayManager'
export { setupAppMenu } from './appMenu'
export { registerCoreIpc } from './ipc'
export type { CoreIpcDeps } from './ipc'
export { registerLogIpc } from './logIpc'
export { installCrashGuard } from './crashGuard'
export { startAppUpdater } from './appUpdater'
export { registerUpdaterIpc } from './updaterIpc'
export { installWebviewWindowOpenHandler, installGuestDevToolsLifecycle } from './webview'
export { applyNativeThemeSource } from './theme'
