/**
 * 规范化 base：空或 `/` → `''`；否则保证以 `/` 开头、无尾斜杠（如 `/app`）
 */
export function normalizeBasePath(raw?: string | null): string {
  const t = (raw ?? '').trim().replace(/\\/g, '/')
  if (!t || t === '/') return ''
  const withSlash = t.startsWith('/') ? t : `/${t}`
  return withSlash.replace(/\/+$/, '')
}
