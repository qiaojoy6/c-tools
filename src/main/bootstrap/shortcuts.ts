import { DEFAULT_CONFIG, type ConfigManager } from '../config'
import { ShortcutManager, normalizeAccelerator, type WindowManager } from '../modules/core'
import type { ShortcutHandlers } from '../modules/core/shortcutManager'
import type { FeatureHost } from '../modules/feature'

export type ShortcutSetupDeps = {
  config: ConfigManager
  windows: WindowManager
  /** 已 setup 的 FeatureHost；快捷键由已启用 Feature 贡献 */
  featureHost: FeatureHost
}

/** 规范化配置中的快捷键并注册；失败则回退默认 */
export function setupShortcuts(deps: ShortcutSetupDeps): ShortcutManager {
  const { config, windows, featureHost } = deps

  const manager = new ShortcutManager(buildHandlers(featureHost))

  const cfg = config.get()
  const nextShortcuts = {
    toggleClipboard: normalizeAccelerator(cfg.shortcuts.toggleClipboard),
    toggleQuickFolders: normalizeAccelerator(cfg.shortcuts.toggleQuickFolders ?? ''),
    screenshot: normalizeAccelerator(cfg.shortcuts.screenshot),
    recorderRegion: normalizeAccelerator(cfg.shortcuts.recorderRegion ?? ''),
    recorderFullscreen: normalizeAccelerator(cfg.shortcuts.recorderFullscreen ?? ''),
    recorderPauseResume: normalizeAccelerator(cfg.shortcuts.recorderPauseResume ?? ''),
    recorderStop: normalizeAccelerator(cfg.shortcuts.recorderStop ?? '')
  }
  if (
    nextShortcuts.toggleClipboard !== cfg.shortcuts.toggleClipboard ||
    nextShortcuts.toggleQuickFolders !== (cfg.shortcuts.toggleQuickFolders ?? '') ||
    nextShortcuts.screenshot !== cfg.shortcuts.screenshot ||
    nextShortcuts.recorderRegion !== (cfg.shortcuts.recorderRegion ?? '') ||
    nextShortcuts.recorderFullscreen !== (cfg.shortcuts.recorderFullscreen ?? '') ||
    nextShortcuts.recorderPauseResume !== (cfg.shortcuts.recorderPauseResume ?? '') ||
    nextShortcuts.recorderStop !== (cfg.shortcuts.recorderStop ?? '')
  ) {
    config.update({ shortcuts: nextShortcuts })
  }

  const failed = manager.registerAll(config.get().shortcuts)
  if (failed.length) {
    config.update({ shortcuts: DEFAULT_CONFIG.shortcuts })
    manager.registerAll(DEFAULT_CONFIG.shortcuts)
  }

  windows.onSettingsClosed = () => {
    // 设置关闭后按当前 Feature 开关重绑再注册
    resyncShortcutHandlers(manager, featureHost)
    manager.registerAll(config.get().shortcuts)
  }

  return manager
}

/** 功能开关变更后：重绑 handler 并按当前 shortcuts 配置注册 */
export function resyncShortcutHandlers(
  manager: ShortcutManager,
  featureHost: FeatureHost
): void {
  manager.setHandlers(buildHandlers(featureHost))
}

const SHORTCUT_HANDLER_KEYS: Array<keyof ShortcutHandlers> = [
  'toggleClipboard',
  'toggleQuickFolders',
  'screenshot',
  'recorderRegion',
  'recorderFullscreen',
  'recorderPauseResume',
  'recorderStop'
]

const noop = (): void => {}

function buildHandlers(featureHost: FeatureHost): ShortcutHandlers {
  return withNoopHandlers(featureHost.collectShortcutHandlers())
}

/** 未贡献的键填空操作（对应 Feature 已禁用） */
function withNoopHandlers(partial: Partial<ShortcutHandlers>): ShortcutHandlers {
  const out = { ...partial } as ShortcutHandlers
  for (const key of SHORTCUT_HANDLER_KEYS) {
    if (!out[key]) out[key] = noop
  }
  return out
}
