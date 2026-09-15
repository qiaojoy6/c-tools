import { getHostsElevateSession } from './elevateSession'

/**
 * 以提升权限将内容写入系统 hosts，并刷新 DNS。
 * 走授权会话：首次弹系统授权，空闲 10 分钟内复用（滑动续期）。
 */
export async function elevateWriteHosts(_hostsPath: string, content: string): Promise<void> {
  await getHostsElevateSession().writeHosts(content)
}
