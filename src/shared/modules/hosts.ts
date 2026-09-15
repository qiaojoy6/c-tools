/** ============ Hosts 模块共享类型 ============ */

/** 单个 Hosts 方案（Tab） */
export interface HostsScheme {
  id: string
  /** 展示名（可改；系统标记只认 id） */
  name: string
  /** 是否写入系统 hosts */
  enabled: boolean
  /** 纯文本 hosts 内容（不做格式校验） */
  content: string
  createdAt: number
  updatedAt: number
}

/** userData/hosts-schemes.json */
export interface HostsSchemesFile {
  version: 1
  schemes: HostsScheme[]
}

/** 写系统 / 变更结果 */
export type HostsMutationResult =
  | { ok: true; schemes: HostsScheme[] }
  | { ok: false; error: string }

/** 提权免密会话（滑动窗口） */
export interface HostsAuthSession {
  /** 当前是否可免密写入 */
  active: boolean
  /** 下次需系统授权的时间戳；无会话为 null */
  expiresAt: number | null
  /** 空闲 TTL（毫秒） */
  ttlMs: number
}
