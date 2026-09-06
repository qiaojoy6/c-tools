/** ============ 剪贴板模块共享类型 ============ */

/** 剪贴记录类型 */
export type ClipType = 'text' | 'image'

/** 图片元数据（二进制在 userData/clipboard-images/{fileId}） */
export interface ClipImage {
  /** 文件名，如 `{sha256}.png` */
  fileId: string
  width: number
  height: number
  /** 文件字节数 */
  byteLength: number
  /** 内容 sha256，去重 / 收藏比对 */
  hash: string
}

/** 剪贴记录 */
export interface ClipRecord {
  id: string
  type: ClipType
  /** 文本内容（type=text 时有效） */
  text: string | null
  /** 图片信息（type=image 时有效） */
  image: ClipImage | null
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

/** 渲染进程图片地址（自定义协议） */
export function clipImageSrc(fileId: string): string {
  return `clipimg://local/${encodeURIComponent(fileId)}`
}
