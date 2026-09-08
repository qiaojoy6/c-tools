/** ============ webview guest 相关共享类型 ============ */

/**
 * 项目预览 webview 持久分区名（Cookie / HTTP 缓存 / LocalStorage 等）
 * 磁盘路径：`{userData}/Partitions/projects-preview/`
 */
export const PROJECTS_PREVIEW_PARTITION = 'persist:projects-preview'

/** webview 右键菜单 IPC 载荷（渲染 → 主进程） */
export interface WebviewContextMenuPayload {
  webContentsId: number
  x: number
  y: number
  linkURL?: string
  srcURL?: string
  selectionText?: string
  isEditable?: boolean
  editFlags?: {
    canUndo?: boolean
    canRedo?: boolean
    canCut?: boolean
    canCopy?: boolean
    canPaste?: boolean
    canDelete?: boolean
    canSelectAll?: boolean
  }
}

/** webview:window-open — guest 请求新窗口时主进程推给宿主 */
export interface WebviewWindowOpenPayload {
  webContentsId: number
  url: string
}

/**
 * 清除预览浏览数据选项（类浏览器「清除浏览数据」）
 * 至少应选一项；未传字段视为 false
 * - 传 origin：只清该源（预览工具栏「清除此网站数据」）
 * - 传 all：清整个预览分区（设置页「清除全部」）
 */
export interface ClearPreviewCacheOptions {
  /** 为 true 时清除整个预览分区，忽略 origin */
  all?: boolean
  /** 目标源，形如 `http://127.0.0.1:5173`（与 location.origin 一致） */
  origin?: string
  /** 缓存的图片和文件（HTTP 磁盘缓存） */
  cache?: boolean
  /** Cookie */
  cookies?: boolean
  /** 本地存储 Local Storage */
  localStorage?: boolean
  /** IndexedDB */
  indexedDB?: boolean
  /** Service Worker / Cache Storage */
  serviceWorkers?: boolean
}
