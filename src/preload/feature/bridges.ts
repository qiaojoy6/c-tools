import { defineNestedBridge, defineRootBridge } from './defineBridge'
import { appApi } from '../modules/app'
import { clipboardApi } from '../modules/clipboard'
import { projectsApi } from '../modules/projects'
import { quickFoldersApi } from '../modules/quickFolders'
import { logBridgeApi } from '../modules/log'
import { screenshotApi } from '../modules/screenshot'
import { recorderApi } from '../modules/recorder'

/**
 * Preload bridge 注册表：新增模块在此追加一条即可（并实现对应 modules/*.ts）。
 * 顺序：壳 → 业务；flat 与 nested 勿撞名。
 */
export const PRELOAD_BRIDGES = [
  defineRootBridge('app', appApi),
  defineRootBridge('log', logBridgeApi),
  defineRootBridge('clipboard', clipboardApi),
  defineRootBridge('projects', projectsApi),
  defineNestedBridge('quickFolders', 'quickFolders', quickFoldersApi),
  defineNestedBridge('screenshot', 'screenshot', screenshotApi),
  defineNestedBridge('recorder', 'recorder', recorderApi)
] as const
