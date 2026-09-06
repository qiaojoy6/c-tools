import { dirname, extname, join, resolve } from 'path'
import { existsSync, readFileSync } from 'fs'

/** 常见静态图标文件名（相对入口目录 / 项目根） */
const ICON_FILES = [
  'favicon.ico',
  'favicon.png',
  'favicon.svg',
  'apple-touch-icon.png',
  'apple-touch-icon.ico',
  'logo.svg',
  'logo.png'
] as const

const MAX_ICON_BYTES = 256 * 1024

const MIME_BY_EXT: Record<string, string> = {
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml'
}

/**
 * 解析项目图标为 data URL，供渲染进程直接展示（不依赖预览服务）。
 * 优先入口 HTML 的 link rel=icon，再探测常见文件名。
 */
export function resolveProjectIconDataUrl(
  projectDir: string,
  entryPath: string
): string | null {
  const entryAbs = join(projectDir, entryPath)
  const entryDir = dirname(entryAbs)

  const fromHtml = iconFromHtmlLink(entryAbs, entryDir)
  if (fromHtml) return fromHtml

  for (const dir of uniqueDirs(entryDir, projectDir)) {
    for (const name of ICON_FILES) {
      const dataUrl = fileToDataUrl(join(dir, name))
      if (dataUrl) return dataUrl
    }
  }
  return null
}

function uniqueDirs(...dirs: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const d of dirs) {
    const key = d.replace(/\\/g, '/').toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(d)
  }
  return out
}

/** 从入口 HTML 解析相对路径的 favicon / apple-touch-icon */
function iconFromHtmlLink(htmlPath: string, baseDir: string): string | null {
  if (!existsSync(htmlPath)) return null
  let html: string
  try {
    html = readFileSync(htmlPath, 'utf8')
  } catch {
    return null
  }
  // 入口 HTML 通常不大；截断避免异常大文件拖慢扫描
  if (html.length > 512 * 1024) html = html.slice(0, 512 * 1024)

  const linkRe = /<link\b[^>]*>/gi
  let match: RegExpExecArray | null
  while ((match = linkRe.exec(html))) {
    const tag = match[0]
    const rel = /rel\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase()
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.trim()
    if (!rel || !href) continue
    if (!rel.includes('icon')) continue
    if (/^(https?:|data:|\/\/)/i.test(href)) continue

    const clean = href.split(/[?#]/)[0]!.replace(/^\//, '')
    if (!clean) continue
    const abs = resolve(baseDir, clean)
    const dataUrl = fileToDataUrl(abs)
    if (dataUrl) return dataUrl
  }
  return null
}

function fileToDataUrl(absPath: string): string | null {
  if (!existsSync(absPath)) return null
  try {
    const buf = readFileSync(absPath)
    if (!buf.length || buf.length > MAX_ICON_BYTES) return null
    const ext = extname(absPath).toLowerCase()
    const mime = MIME_BY_EXT[ext]
    if (!mime) return null
    if (ext === '.svg') {
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buf.toString('utf8'))}`
    }
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}
