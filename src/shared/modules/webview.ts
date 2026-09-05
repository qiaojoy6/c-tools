/** ============ webview guest 相关共享类型 ============ */

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
