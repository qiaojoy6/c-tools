/** 主进程启动编排：按职责拆分，由 index 按序调用 */
export type { AppContext, RecorderActions } from './context'
export { runWhenReady } from './ready'
export { attachAppLifecycle } from './lifecycle'
export { prepareQuit, quitApp } from './quit'
