/**
 * Preload Feature bridge 贡献：与主进程 defineFeature 对齐的「暴露面」注册。
 * flat = 展开到 window.api 根；nested = window.api[key]
 */

export type RootPreloadBridge<T extends object = object> = {
  id: string
  mount: 'root'
  api: T
}

export type NestedPreloadBridge<T extends object = object> = {
  id: string
  mount: 'nested'
  key: string
  api: T
}

export type PreloadBridge = RootPreloadBridge | NestedPreloadBridge

/** 根级合并（如 clipboard / projects / app） */
export function defineRootBridge<T extends object>(id: string, api: T): RootPreloadBridge<T> {
  return { id, mount: 'root', api }
}

/** 嵌套挂载（如 api.quickFolders / api.screenshot） */
export function defineNestedBridge<T extends object>(
  id: string,
  key: string,
  api: T
): NestedPreloadBridge<T> {
  return { id, mount: 'nested', key, api }
}

/** 按注册表组装 window.api 对象 */
export function assemblePreloadApi(bridges: PreloadBridge[]): Record<string, unknown> {
  const api: Record<string, unknown> = {}
  const seenIds = new Set<string>()
  const seenKeys = new Set<string>()

  for (const bridge of bridges) {
    if (seenIds.has(bridge.id)) {
      throw new Error(`preload: duplicate bridge id "${bridge.id}"`)
    }
    seenIds.add(bridge.id)

    if (bridge.mount === 'root') {
      for (const key of Object.keys(bridge.api)) {
        if (seenKeys.has(key) || key in api) {
          throw new Error(`preload: duplicate root api key "${key}" from "${bridge.id}"`)
        }
        seenKeys.add(key)
      }
      Object.assign(api, bridge.api)
    } else {
      if (bridge.key in api || seenKeys.has(bridge.key)) {
        throw new Error(`preload: duplicate nested key "${bridge.key}" from "${bridge.id}"`)
      }
      seenKeys.add(bridge.key)
      api[bridge.key] = bridge.api
    }
  }

  return api
}
