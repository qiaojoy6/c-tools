/**
 * 从 Electron ipcRenderer.invoke 拒绝值中取出可读错误文案
 * 主进程 `throw new Error('…')` 经 invoke 后常带
 * `Error invoking remote method '…': Error: …` 前缀，展示前剥掉
 */
export function ipcErrorMessage(err: unknown, fallback: string): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : ''
  if (!raw) return fallback
  const m = raw.match(/Error invoking remote method '[^']+':(?: Error:)?\s*([\s\S]*)$/)
  const msg = (m?.[1] || raw).trim()
  return msg || fallback
}
