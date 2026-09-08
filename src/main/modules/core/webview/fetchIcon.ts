import { net } from 'electron'

const MAX_ICON_BYTES = 256 * 1024

/**
 * 拉取远程图标为 data URL（宿主 CSP 不允许外链 img，须转 data:）
 * 仅允许 http(s)；超限 / 非图片则返回 null
 */
export async function fetchIconDataUrl(url: string): Promise<string | null> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null

  try {
    const res = await net.fetch(url, { redirect: 'follow' })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length || buf.length > MAX_ICON_BYTES) return null

    let mime = res.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() || ''
    if (!mime.startsWith('image/')) {
      // 部分站点 .ico 会回 octet-stream
      if (parsed.pathname.toLowerCase().endsWith('.ico') || mime === 'application/octet-stream') {
        mime = 'image/x-icon'
      } else {
        return null
      }
    }
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}
