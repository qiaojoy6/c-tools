import { app } from 'electron'

/** 是否应在程序坞显示图标（由 WindowManager 绑定） */
let shouldShowDock: (() => boolean) | null = null

/** 上次已应用的策略，避免重复 setActivationPolicy / dock.show 搅乱 Dock */
let lastDockShown: boolean | null = null

/**
 * 截屏 / 框选期间冻结 Dock：保持进入前的显隐，避免藏窗后切 accessory 闪一下。
 */
let dockHold = false
let dockHoldShow: boolean | null = null

/**
 * 绑定程序坞图标策略：
 * 默认 accessory（不进程序坞）；唤起面板后 regular；最小化仍保留。
 */
export function bindDockIconToPanel(shouldShow: () => boolean): void {
  shouldShowDock = shouldShow
  lastDockShown = null
  syncMacDockIcon()
}

/** 按当前策略同步程序坞图标 */
export function syncMacDockIcon(): void {
  applyDockVisibility()
}

/**
 * 截屏遮罩 focus 可能把策略打回 regular。
 * 在仍不应显示图标时立刻压回 accessory（截屏 hold 期间不压，避免闪）。
 */
export function reassertMacDockHiddenIfNeeded(): void {
  if (process.platform !== 'darwin') return
  if (dockHold) return
  if (shouldShowDock?.()) return
  // 强制再写一遍（外部可能已把策略改乱）
  lastDockShown = null
  applyDockVisibility()
}

/**
 * 截屏/框选：冻结程序坞显隐为进入瞬间的状态。
 * 结束后再按面板真实显隐同步一次。
 */
export function holdMacDockDuringShot(hold: boolean): void {
  if (process.platform !== 'darwin') return
  if (hold) {
    dockHold = true
    dockHoldShow = shouldShowDock?.() ?? lastDockShown ?? false
    // 钉住当前策略，后续 sync/reassert 在 hold 内不再翻成 accessory
    lastDockShown = null
    applyDockVisibility()
    return
  }
  dockHold = false
  dockHoldShow = null
  lastDockShown = null
  applyDockVisibility()
}

function applyDockVisibility(): void {
  if (process.platform !== 'darwin') return
  const show = dockHold ? Boolean(dockHoldShow) : (shouldShowDock?.() ?? false)
  if (lastDockShown === show) return
  lastDockShown = show
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
