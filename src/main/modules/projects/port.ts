import { createServer } from 'net'

/** 允许配置的固定端口范围（避开特权端口） */
export const MIN_FIXED_PORT = 1024
export const MAX_FIXED_PORT = 65535

/**
 * 解析用户输入的固定端口；空串返回 undefined（表示随机）
 * 非法则抛中文 Error
 */
export function parseFixedPort(raw: string | number | null | undefined): number | undefined {
  if (raw === null || raw === undefined) return undefined
  const text = String(raw).trim()
  if (!text) return undefined
  if (!/^\d+$/.test(text)) {
    throw new Error('端口须为数字')
  }
  const port = Number(text)
  if (!Number.isInteger(port) || port < MIN_FIXED_PORT || port > MAX_FIXED_PORT) {
    throw new Error(`端口须在 ${MIN_FIXED_PORT}–${MAX_FIXED_PORT} 之间`)
  }
  return port
}

/** 探测本机 127.0.0.1 上端口是否可绑定 */
export function isPortFree(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    server.unref()
    server.once('error', () => resolve(false))
    server.listen(port, host, () => {
      server.close(() => resolve(true))
    })
  })
}

/** 端口不可用时抛错，供保存 / 启动前校验 */
export async function assertPortAvailable(port: number): Promise<void> {
  const free = await isPortFree(port)
  if (!free) {
    throw new Error(`端口 ${port} 已被占用，请更换后重试`)
  }
}
