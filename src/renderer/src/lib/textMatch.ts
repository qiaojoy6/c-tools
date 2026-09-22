import { match } from 'pinyin-pro'

/**
 * 文本搜索：原文包含（忽略大小写）或拼音 / 首字母命中。
 * 剪贴板 / 快捷文件夹共用。例：「剪贴板」可被「jt」「jiantie」命中。
 */
export function textMatchesQuery(text: string, query: string): boolean {
  const q = query.trim()
  if (!q) return true
  if (text.toLowerCase().includes(q.toLowerCase())) return true
  // pinyin-pro：全拼、首字母、连续片段；无命中返回 null
  try {
    return match(text, q) != null
  } catch {
    return false
  }
}
