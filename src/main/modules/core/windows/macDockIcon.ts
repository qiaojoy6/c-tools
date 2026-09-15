import { app } from 'electron'

/** 是否应在程序坞显示图标（由 WindowManager 绑定） */
let shouldShowDock: (() => boolean) | null = null

/**
 * 绑定程序坞图标策略：
 * 默认 accessory（不进程序坞）；唤起面板后 regular；最小化仍保留。
 */
export function bindDockIconToPanel(shouldShow: () => boolean): void {
  shouldShowDock = shouldShow
  syncMacDockIcon()
}

/** 按当前策略同步程序坞图标 */
export function syncMacDockIcon(): void {
  applyDockVisibility()
}

/**
 * 截屏遮罩 focus / VisibleOnAllWorkspaces 可能把策略打回 regular。
 * 在仍不应显示图标时立刻压回 accessory。
 */
export function reassertMacDockHiddenIfNeeded(): void {
  if (process.platform !== 'darwin') return
  if (shouldShowDock?.()) return
  applyDockVisibility()
}

/** @deprecated 保留导出；系统栏已不再 HideDock，无需延迟补 hide */
export function prepareMacDockBeforeChromeRestore(): void {
  reassertMacDockHiddenIfNeeded()
}

/** @deprecated 同上 */
export function syncMacDockIconAfterChromeRestore(): void {
  applyDockVisibility()
}

function applyDockVisibility(): void {
  if (process.platform !== 'darwin') return
  const show = shouldShowDock?.() ?? false
  try {
    // accessory 不进 Dock；勿再调 dock.hide（与系统栏动画叠在一起会抖一下）
    app.setActivationPolicy(show ? 'regular' : 'accessory')
  } catch {
    /* ignore */
  }
  if (show) {
    void app.dock?.show()
  }
}
