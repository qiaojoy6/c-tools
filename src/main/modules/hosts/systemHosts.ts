import { readFileSync } from 'fs'
import type { HostsScheme } from '@shared/types'
import { elevateWriteHosts } from './elevateWrite'
import { detectEol, rebuildWithSchemes } from './markers'
import { getSystemHostsPath, isHostsPlatformSupported } from './paths'

/** 读取系统 hosts 原文 */
export function readSystemHostsText(): string {
  const path = getSystemHostsPath()
  return readFileSync(path, 'utf8')
}

/**
 * 按当前启用方案顺序重建系统 hosts（块外不动），提权写入并 flush DNS。
 */
export async function applyEnabledSchemesToSystem(schemes: HostsScheme[]): Promise<void> {
  if (!isHostsPlatformSupported()) {
    throw new Error('仅支持 macOS 与 Windows')
  }
  const hostsPath = getSystemHostsPath()
  const original = readSystemHostsText()

  const eol = process.platform === 'win32' ? '\r\n' : detectEol(original)
  const enabled = schemes.filter((s) => s.enabled).map((s) => ({ id: s.id, content: s.content }))
  const next = rebuildWithSchemes(original, enabled, eol)
  await elevateWriteHosts(hostsPath, next)
}

/** 清空全部 c-tools 段（启用列表视为空） */
export async function removeAllCtoolsFromSystem(): Promise<void> {
  await applyEnabledSchemesToSystem([])
}
