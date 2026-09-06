/** 相对时间格式化（中文） */
export function formatTime(ts: number): string {
  const now = Date.now()
  const diff = now - ts
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  const d = new Date(ts)
  const pad = (n: number): string => String(n).padStart(2, '0')
  const hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`

  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`

  const today = new Date()
  const isYesterday =
    new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1).toDateString() ===
    d.toDateString()
  if (isYesterday) return `昨天 ${hhmm}`

  if (d.getFullYear() === today.getFullYear()) {
    return `${d.getMonth() + 1}月${d.getDate()}日 ${hhmm}`
  }
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`
}

/** 图片字节大小格式化 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes.toFixed(0)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
