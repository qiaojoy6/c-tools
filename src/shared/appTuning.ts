/**
 * 写死的产品常量。改尺寸、延时、上限只动本文件。
 *
 * 按进程分区，方便改的时候对号入座：
 * - 共用：主进程与渲染进程都会读
 * - 主进程：BrowserWindow / 原生 / 会话 / 更新
 * - 渲染进程：页面交互与标注 UI
 *
 * 不放这里的：
 * - 用户能在设置里改、会写入 settings.json 的默认值 → `src/main/config/defaults.ts`
 * - 快捷键默认值 → `src/shared/shortcuts.ts`
 * - 协议名、Win32 标志、日志截断（改了会坏数据或无意义）
 */

// =============================================================================
// 共用（主进程 + 渲染进程）
// =============================================================================

/**
 * 功能面板。
 * 主进程：创建 BrowserWindow、titleBarOverlay、交通灯。
 * 渲染：WindowTitleBar 通栏高度与标题（须与 titleBarHeight 一致）。
 */
export const PANEL_WINDOW = {
  width: 880,
  height: 600,
  minWidth: 720,
  minHeight: 480,
  title: '功能面板',
  /** 自定义通栏高度，对齐 titleBarOverlay 与 macOS 交通灯 */
  titleBarHeight: 40,
  /** 交通灯相对窗口左上角（macOS，仅主进程） */
  trafficLight: { x: 6, y: 12 }
} as const

/**
 * 录屏约束与 UI。
 * 主进程：选屏弹窗尺寸、外框/悬浮条、fps clamp、开录默认帧率。
 * 渲染：框选拖拽阈值、最小选区、确认时的默认 fps。
 * 区域录制只在鼠标所在屏；全屏录制是选屏弹窗，不框选。
 */
export const RECORDER_UI = {
  /** 全屏选屏弹窗尺寸（主进程 fullscreenHost） */
  fullscreenDialog: { width: 420, height: 460 },
  /** 未指定帧率时使用；同时是 clamp 的回落值（主进程 + 渲染确认） */
  defaultFps: 30,
  /** fps 下限（主进程 clamp） */
  minFps: 1,
  /** fps 上限（主进程 clamp） */
  maxFps: 60,
  /** 选区任一边小于此值（DIP）则不开始录制（渲染框选页） */
  minSelectionDip: 16,
  /** 按下移动超过该像素才算拖拽框选，否则视为点击（渲染框选页） */
  dragThresholdPx: 5,
  /** 区域录制时选区外框线宽 DIP（主进程 borderHost） */
  borderPx: 3,
  /** 录制悬浮条尺寸与离屏幕边缘间距（主进程 borderHost） */
  float: { width: 168, height: 34, margin: 10 }
} as const

// =============================================================================
// 主进程
// =============================================================================

/** Windows / Linux 原生窗控覆盖层（浅色） */
export const PANEL_TITLE_BAR_OVERLAY_LIGHT = {
  color: '#eef0f3',
  symbolColor: '#52525b',
  height: PANEL_WINDOW.titleBarHeight
} as const

/** Windows / Linux 原生窗控覆盖层（深色） */
export const PANEL_TITLE_BAR_OVERLAY_DARK = {
  color: '#2a2e38',
  symbolColor: '#c4c4cc',
  height: PANEL_WINDOW.titleBarHeight
} as const

/** 独立设置窗口（settingsWindow） */
export const SETTINGS_WINDOW = {
  width: 720,
  height: 560,
  minWidth: 640,
  minHeight: 480
} as const

/**
 * 焦点交接等待（毫秒）。过短容易贴到错误窗口。
 * restore：hide 本窗口后等到外部应用到前台再模拟粘贴（focusHandoff）。
 * prePaste：已激活目标后、发出 ⌘V / Ctrl+V 之前（focusTarget）。
 */
export const FOCUS_TIMING = {
  restoreDelayMs: { darwin: 90, win32: 180 },
  prePasteDelayMs: { darwin: 10, win32: 80 }
} as const

/**
 * Hosts 提权会话（elevateSession / elevateHelperScripts）。
 * 空闲超过此时长后再写入需重新授权；helper 未传 TTL 时的默认秒数由此换算。
 */
export const HOSTS_TUNING = {
  authSessionTtlMs: 10 * 60 * 1000
} as const

/** 自动更新（appUpdater）。macOS 未签名，只打开下载页，不静默安装。 */
export const UPDATER_TUNING = {
  /** 启动后延迟检查，避开冷启动抢带宽 */
  startupCheckDelayMs: 5_000,
  githubReleasesUrl: 'https://github.com/qiaojoy6/c-tools/releases/latest'
} as const

/** 按平台取还焦等待；非 Windows 用 darwin 值 */
export function restoreFocusDelayMs(platform: string = process.platform): number {
  return platform === 'win32' ? FOCUS_TIMING.restoreDelayMs.win32 : FOCUS_TIMING.restoreDelayMs.darwin
}

/** 按平台取粘贴前等待 */
export function prePasteDelayMs(platform: string = process.platform): number {
  return platform === 'win32' ? FOCUS_TIMING.prePasteDelayMs.win32 : FOCUS_TIMING.prePasteDelayMs.darwin
}

/** Hosts helper 默认 TTL（秒），与 authSessionTtlMs 一致 */
export function hostsAuthTtlSec(): number {
  return Math.ceil(HOSTS_TUNING.authSessionTtlMs / 1000)
}

// =============================================================================
// 渲染进程
// =============================================================================

/**
 * 截屏框选与标注工具（ScreenshotPage / screenshot/tools）。
 * 拖拽阈值与录屏框选页同量级，但只作用于截屏页。
 */
export const SCREENSHOT_UI = {
  /** 超过才进入拖拽选区 */
  dragThresholdPx: 5,
  /** 笔 / 矩形 / 箭头线宽 */
  stroke: { min: 1, max: 20, default: 3 },
  /** 马赛克粒度（像素） */
  mosaic: { min: 2, max: 10, default: 6 },
  /** 工具条与选区、屏幕边缘的间距 */
  dockGap: 10,
  dockMargin: 8
} as const
