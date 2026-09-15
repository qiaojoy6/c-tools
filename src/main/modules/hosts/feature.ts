import { defineFeature, type FeatureHandles } from '../feature'
import { HostsStore } from './store'
import { registerHostsIpc } from './ipc'
import { getHostsElevateSession } from './elevateSession'

export type HostsFeatureHandles = FeatureHandles & {
  store: HostsStore
}

/** Hosts 主进程 Feature：lifecycle + IPC */
export const hostsFeature = defineFeature({
  id: 'hosts',
  setup(): HostsFeatureHandles {
    const store = new HostsStore()
    store.init()
    return {
      store,
      dispose: async () => {
        store.dispose()
        await getHostsElevateSession().dispose()
      }
    }
  },
  registerIpc(_ctx, handles) {
    registerHostsIpc((handles as HostsFeatureHandles).store)
  }
})
