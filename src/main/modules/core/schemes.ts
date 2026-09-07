import { protocol } from 'electron'

const PRIVILEGES = {
  standard: true,
  secure: true,
  supportFetchAPI: true,
  bypassCSP: true,
  stream: true,
  corsEnabled: true
} as const

/**
 * Electron 要求 registerSchemesAsPrivileged 在 ready 前只调用一次；
 * clipimg / shotimg 必须合注册，否则后一次会覆盖前一次，历史图片协议失效。
 */
export function registerAllCustomSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'clipimg', privileges: { ...PRIVILEGES } },
    { scheme: 'shotimg', privileges: { ...PRIVILEGES } }
  ])
}
