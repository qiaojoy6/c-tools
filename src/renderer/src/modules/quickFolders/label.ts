import type { QuickFolderItem } from '@shared/types'

/** 路径末段作默认展示名 */
export function folderName(path: string): string {
  const parts = path.replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] || path
}

/** 有备注用备注，否则用文件夹名 */
export function primaryLabel(item: QuickFolderItem): string {
  const note = item.note.trim()
  return note || folderName(item.path)
}
