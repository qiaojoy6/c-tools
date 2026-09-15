import type { FeaturesConfig, ToggleableFeatureId } from '@shared/modules/feature'

/** 判断某业务 Feature 是否启用（缺省 true） */
export function isFeatureEnabled(
  features: FeaturesConfig | undefined,
  id: ToggleableFeatureId
): boolean {
  return features?.enabled?.[id] !== false
}

/** 过滤列表：仅保留已启用的 ToggleableFeature */
export function filterEnabledFeatures<T extends { id: string }>(
  items: T[],
  features: FeaturesConfig | undefined
): T[] {
  return items.filter((item) => {
    const id = item.id as ToggleableFeatureId
    // general / settings 等非业务 id 始终保留
    if (
      id !== 'clipboard' &&
      id !== 'quickFolders' &&
      id !== 'projects' &&
      id !== 'screenshot' &&
      id !== 'recorder' &&
      id !== 'hosts'
    ) {
      return true
    }
    return isFeatureEnabled(features, id)
  })
}
