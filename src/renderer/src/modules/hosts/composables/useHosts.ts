import type { HostsAuthSession, HostsMutationResult, HostsScheme } from '@shared/types'
import { onMounted, onUnmounted, ref } from 'vue'

const EMPTY_AUTH: HostsAuthSession = { active: false, expiresAt: null, ttlMs: 10 * 60 * 1000 }

/** Hosts 方案列表、提权会话与操作 */
export function useHosts() {
  const schemes = ref<HostsScheme[]>([])
  /** 主进程只在会话变化时推送 expiresAt；倒计时由渲染层本地算 */
  const authSession = ref<HostsAuthSession>({ ...EMPTY_AUTH })
  let offUpdated: (() => void) | null = null
  let offAuth: (() => void) | null = null

  async function refresh(): Promise<void> {
    schemes.value = await window.api.hosts.list()
  }

  onMounted(() => {
    void refresh()
    // 进页拉一次；之后只收 hosts:authSession 推送
    void window.api.hosts.getAuthSession().then((info) => {
      authSession.value = info
    })
    offUpdated = window.api.hosts.onUpdated((next) => {
      schemes.value = next
    })
    offAuth = window.api.hosts.onAuthSession((info) => {
      authSession.value = info
    })
  })

  onUnmounted(() => {
    offUpdated?.()
    offUpdated = null
    offAuth?.()
    offAuth = null
  })

  return {
    schemes,
    authSession,
    refresh,
    readSystem: (): Promise<
      { ok: true; content: string; path: string } | { ok: false; error: string }
    > => window.api.hosts.readSystem(),
    add: (name: string): Promise<HostsMutationResult> => window.api.hosts.add(name),
    rename: (id: string, name: string): Promise<HostsMutationResult> =>
      window.api.hosts.rename(id, name),
    setContent: (id: string, content: string): Promise<HostsMutationResult> =>
      window.api.hosts.setContent(id, content),
    setEnabled: (id: string, enabled: boolean): Promise<HostsMutationResult> =>
      window.api.hosts.setEnabled(id, enabled),
    remove: (id: string): Promise<HostsMutationResult> => window.api.hosts.remove(id),
    reorder: (ids: string[]): Promise<HostsMutationResult> => window.api.hosts.reorder(ids)
  }
}
