/**
 * 本应用窗口在截屏 / 录制等场景下的隐身策略。
 * 业务只选策略名；具体 opacity / hide / Dock 由 begin/end 统一处理。
 *
 * 已有策略：
 * - `none`：完全不动窗口（录制框选/全屏）
 * - `dim-panel-if-visible`：面板开着 → 透明度 0（结束恢复）；没开 → noop
 *   （截屏开启「隐藏本应用窗口」时用；关闭该设置则用 `none`）
 *
 * 以后若其它窗口要用，直接 begin/end 同一套即可，例如再加 `dim-settings-if-visible`。
 */

export type AppUiConcealStrategy = 'none' | 'dim-panel-if-visible'

/** begin 返回的会话句柄，结束时交给 end */
export type AppUiConcealSession = {
  strategy: AppUiConcealStrategy
  /** 是否对面板做过透明度隐身 */
  dimmedPanel: boolean
}

/** 策略操作面板所需的最小宿主（由 WindowManager 注入） */
export type AppUiConcealHost = {
  isPanelVisible: () => boolean
  setPanelDimmed: (dimmed: boolean) => void
}

/** 截屏设置 → 策略 */
export function screenshotConcealStrategy(hideAppWindows: boolean): AppUiConcealStrategy {
  return hideAppWindows ? 'dim-panel-if-visible' : 'none'
}

/** 录制固定不碰窗口 */
export function recorderConcealStrategy(): AppUiConcealStrategy {
  return 'none'
}

/** 按策略开始隐身；返回会话供 end 还原 */
export function beginAppUiConceal(
  strategy: AppUiConcealStrategy,
  host: AppUiConcealHost
): AppUiConcealSession {
  if (strategy === 'dim-panel-if-visible' && host.isPanelVisible()) {
    host.setPanelDimmed(true)
    return { strategy, dimmedPanel: true }
  }
  return { strategy, dimmedPanel: false }
}

/** 结束隐身：只还原 begin 时真正改过的部分 */
export function endAppUiConceal(
  session: AppUiConcealSession,
  host: AppUiConcealHost
): void {
  if (session.dimmedPanel) {
    host.setPanelDimmed(false)
  }
}
