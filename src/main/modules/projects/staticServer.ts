import { createServer, type Server } from 'http'
import { readFile } from 'fs/promises'
import { dirname, extname, join, relative, resolve, sep } from 'path'
import { normalizeBasePath } from './basePath'

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

export interface StaticServerOptions {
  /** 相对项目目录的入口 HTML */
  entryPath: string
  /** 已规范化的 URL 前缀（无尾斜杠），空表示站点根 */
  basePath?: string
  /** 固定端口；缺省 0 由系统分配 */
  port?: number
}

/** 路径是否落在 root 内（防目录穿越） */
function isInsideRoot(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !rel.startsWith('..'))
}

/**
 * 为静态目录起本地 HTTP 服务；可固定端口，缺省随机；缺文件时回退到入口 HTML（SPA）
 * 静态根取入口所在目录，便于 dist/index.html + /assets 的常规产物结构
 */
export function startStaticServer(
  rootDir: string,
  options: StaticServerOptions
): Promise<StaticServerHandle> {
  const projectRoot = resolve(rootDir)
  const entryAbs = resolve(projectRoot, options.entryPath)
  // 资源相对入口目录查找（Vite/webpack 产物）
  const staticRoot = dirname(entryAbs)
  const base = normalizeBasePath(options.basePath)
  const listenPort = options.port && options.port > 0 ? options.port : 0

  const server = createServer(async (req, res) => {
    try {
      const rawUrl = req.url ?? '/'
      const pathname = decodeURIComponent(new URL(rawUrl, 'http://127.0.0.1').pathname)

      // 配置了 base 时：只服务此前缀；裸 `/` 重定向到 base
      let pathUnderRoot = pathname
      if (base) {
        if (pathname === '/' || pathname === '') {
          res.writeHead(302, { Location: `${base}/` })
          res.end()
          return
        }
        if (pathname === base || pathname === `${base}/`) {
          pathUnderRoot = '/'
        } else if (pathname.startsWith(`${base}/`)) {
          pathUnderRoot = pathname.slice(base.length) || '/'
        } else {
          res.writeHead(404).end('Not Found')
          return
        }
      }

      // 根路径（或 base 根）直接回入口 HTML
      if (pathUnderRoot === '/' || pathUnderRoot === '') {
        const data = await readFile(entryAbs)
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache'
        })
        res.end(data)
        return
      }

      let filePath = resolve(staticRoot, `.${pathUnderRoot}`)

      if (!isInsideRoot(staticRoot, filePath)) {
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
          if (isInsideRoot(staticRoot, asIndex)) {
            data = await readFile(asIndex)
            filePath = asIndex
          }
        } catch {
          data = null
        }
      }

      // SPA fallback：非静态扩展名或缺文件 → 入口 HTML
      if (!data) {
        const ext = extname(pathUnderRoot)
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
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && listenPort) {
        reject(new Error(`端口 ${listenPort} 已被占用，请更换固定端口或关闭占用进程`))
        return
      }
      reject(err)
    })
    // port 0 → 系统分配空闲端口；否则绑定固定端口
    server.listen(listenPort, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        reject(new Error('无法获取静态服务端口'))
        return
      }
      const port = addr.port
      // 带 base 时打开带前缀的地址，与构建产物一致
      const url = `http://127.0.0.1:${port}${base}/`
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
