import { createServer, type Server } from 'http'
import { readFile } from 'fs/promises'
import { extname, join, relative, resolve, sep } from 'path'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8'
}

export interface StaticServerHandle {
  server: Server
  port: number
  url: string
  close: () => Promise<void>
}

/** 路径是否落在 root 内（防目录穿越） */
function isInsideRoot(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !rel.startsWith('..'))
}

/**
 * 为静态目录起本地 HTTP 服务（随机端口）；缺文件时回退到入口 HTML（SPA）
 */
export function startStaticServer(
  rootDir: string,
  entryPath: string
): Promise<StaticServerHandle> {
  const root = resolve(rootDir)
  const entryAbs = resolve(root, entryPath)

  const server = createServer(async (req, res) => {
    try {
      const rawUrl = req.url ?? '/'
      const pathname = decodeURIComponent(new URL(rawUrl, 'http://127.0.0.1').pathname)

      // 根路径直接回入口 HTML（支持入口在 dist/ 等子目录）
      if (pathname === '/' || pathname === '') {
        const data = await readFile(entryAbs)
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache'
        })
        res.end(data)
        return
      }

      let filePath = resolve(root, `.${pathname}`)

      if (!isInsideRoot(root, filePath)) {
        res.writeHead(403).end('Forbidden')
        return
      }

      // 目录请求落到 index.html；否则按路径读文件
      let data: Buffer | null = null
      try {
        data = await readFile(filePath)
      } catch {
        // 尝试目录 index
        try {
          const asIndex = join(filePath, 'index.html')
          if (isInsideRoot(root, asIndex)) {
            data = await readFile(asIndex)
            filePath = asIndex
          }
        } catch {
          data = null
        }
      }

      // SPA fallback：非静态扩展名或缺文件 → 入口 HTML
      if (!data) {
        const ext = extname(pathname)
        const looksLikeAsset = Boolean(ext) && ext !== '.html'
        if (!looksLikeAsset) {
          data = await readFile(entryAbs)
          filePath = entryAbs
        } else {
          res.writeHead(404).end('Not Found')
          return
        }
      }

      const type = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' })
      res.end(data)
    } catch (err) {
      console.error('[projects] static serve error:', err)
      res.writeHead(500).end('Internal Server Error')
    }
  })

  return new Promise((resolvePromise, reject) => {
    server.once('error', reject)
    // port 0 → 系统分配空闲端口
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        reject(new Error('无法获取静态服务端口'))
        return
      }
      const port = addr.port
      const url = `http://127.0.0.1:${port}/`
      resolvePromise({
        server,
        port,
        url,
        close: () =>
          new Promise((res, rej) => {
            server.close((err) => (err ? rej(err) : res()))
          })
      })
    })
  })
}
