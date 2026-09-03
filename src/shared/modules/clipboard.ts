/** ============ 剪贴板模块共享类型 ============ */

/** 剪贴记录类型 */
export type ClipType = 'text' | 'image'

/** 剪贴记录 */
export interface ClipRecord {
  id: string
  type: ClipType
  /** 文本内容（type=text 时有效） */
  text: string | null
  /** 图片信息（type=image 时有效） */
  image: { base64: string; width: number; height: number } | null
  /** 复制时间戳 */
  createdAt: number
}

/** 剪贴监听与存储配置 */
export interface ClipboardConfig {
  /** 轮询间隔(ms) */
  pollIntervalMs: number
  /** 最大保存条数（50-200） */
  maxRecords: number
  /** 过期自动清理天数，0 表示永不清理 */
  autoCleanDays: number
}
