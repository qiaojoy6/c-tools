/** ============ 截屏模块共享类型 ============ */

import { defaultShortcut, isDarwinPlatform } from '../shortcuts'

export { isDarwinPlatform }

/** 截屏相关配置 */
export interface ScreenshotConfig {
  /** 进入截屏前是否隐藏本应用窗口（默认 true） */
  hideAppWindows: boolean
}

/** 按平台取默认截屏快捷键（定义见 `@shared/shortcuts`） */
export function defaultScreenshotShortcut(platform?: string): string {
  return defaultShortcut('screenshot', platform)
}

/** 屏幕坐标系下的矩形（物理像素或 DIP，与会话约定一致） */
export interface ShotRect {
  x: number
  y: number
  width: number
  height: number
}

/** 可点选的顶层窗口 */
export interface ShotWindowInfo {
  id: string
  title: string
  bounds: ShotRect
}

/** 单个显示器的冻结帧 */
export interface ShotDisplayFrame {
  /** Electron display.id */
  displayId: number
  /** 全屏 bounds（含菜单栏/程序坞区域） */
  bounds: ShotRect
  /** 可用工作区（macOS 遮罩窗实际只能落在这里） */
  workArea: ShotRect
  scaleFactor: number
  /** 冻结图本地路径（PNG） */
  imagePath: string
}

/** 下发给某个遮罩窗的会话数据 */
export interface ShotOverlayInit {
  sessionId: string
  displayId: number
  /** 全屏 bounds（坐标系原点） */
  bounds: ShotRect
  /** 遮罩窗实际占的工作区（屏幕坐标） */
  workArea: ShotRect
  /**
   * 窗口客户区 (0,0) 相对 bounds 原点的偏移。
   * macOS 上通常为菜单栏高度 / 程序坞占位；Windows 一般为 0。
   */
  viewportOffset: { x: number; y: number }
  scaleFactor: number
  /** 供 img 加载：shotimg://local/... */
  imageUrl: string
  /** 落在该屏上的窗口（已裁到本屏 bounds 坐标系） */
  windows: ShotWindowInfo[]
  /** windows 为空时仅框选 */
  windowPickAvailable: boolean
}
