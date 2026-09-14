/** ============ 快捷文件夹模块共享类型 ============ */

/** 快捷文件夹条目（持久化字段，不含运行时 valid） */
export interface QuickFolderRecord {
  id: string
  /** 绝对路径 */
  path: string
  /** 备注；空字符串表示未填 */
  note: string
  createdAt: number
  updatedAt: number
}

/** 列表返回：附带路径是否仍为有效目录 */
export interface QuickFolderItem extends QuickFolderRecord {
  valid: boolean
}

/** 添加 / 更新入参 */
export interface QuickFolderInput {
  path: string
  note?: string
}

/** 模块配置（落在 settings.json） */
export interface QuickFoldersConfig {
  /** 最大保存条数（默认 50） */
  maxItems: number
}

/** 写操作结果 */
export type QuickFolderMutationResult =
  | { ok: true; item: QuickFolderItem }
  | { ok: false; error: string }
