import { net, protocol } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { basename, join, normalize } from 'path'
import { pathToFileURL } from 'url'
import { getFrameBuffer, screenshotTempDir } from './capture'

export const SHOT_IMG_SCHEME = 'shotimg'

const PNG_HEADERS: Record<string, string> = {
  'Content-Type': 'image/png',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*'
}

/** 优先内存 Buffer，避免读盘延迟 */
export function installScreenshotImageProtocol(): void {
  protocol.handle(SHOT_IMG_SCHEME, (request) => {
    try {
      const u = new URL(request.url)
      const name = decodeURIComponent(u.pathname.replace(/^\/+/, ''))
      if (!/^display-\d+\.png$/i.test(name)) {
        return new Response('Bad Request', { status: 400 })
      }

      const mem = getFrameBuffer(name)
      if (mem) {
        return new Response(new Uint8Array(mem), { headers: PNG_HEADERS })
      }

      const filePath = normalize(join(screenshotTempDir(), name))
      const root = normalize(screenshotTempDir())
      if (!filePath.startsWith(root) || !existsSync(filePath)) {
        return new Response('Not Found', { status: 404 })
      }
      // 兜底读盘
      try {
        const buf = readFileSync(filePath)
        return new Response(new Uint8Array(buf), { headers: PNG_HEADERS })
      } catch {
        return net.fetch(pathToFileURL(filePath).href)
      }
    } catch (err) {
      console.error('[screenshot] shotimg error:', err)
      return new Response('Error', { status: 500 })
    }
  })
}

export function shotImageUrl(imagePath: string): string {
  // 加时间戳打破缓存，保证每次会话都是新图
  const name = basename(imagePath)
  return `${SHOT_IMG_SCHEME}://local/${encodeURIComponent(name)}?t=${Date.now()}`
}
