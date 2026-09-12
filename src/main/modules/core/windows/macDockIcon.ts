import { app } from 'electron'

/** 是否应在程序坞显示图标（由 WindowManager 绑定） */
let shouldShowDock: (() => boolean) | null = null

/**
 * 绑定程序坞图标策略：
 * 默认不展示；唤起面板后展示；最小化仍保留；真正 hide/关窗后隐藏。
 */
export function bindDockIconToPanel(shouldShow: () => boolean): void {
  shouldShowDock = shouldShow
  syncMacDockIcon()
}

/** 按当前策略同步程序坞图标；遮罩恢复 presentation 后也应再调一次 */
export function syncMacDockIcon(): void {
  if (process.platform !== 'darwin') return
  const show = shouldShowDock?.() ?? false
  if (show) app.dock?.show()
  else app.dock?.hide()
}
