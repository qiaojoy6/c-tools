import { session } from 'electron'
import { PROJECTS_PREVIEW_PARTITION, type ClearPreviewCacheOptions } from '@shared/types'
import { writeDiag } from './crashGuard'

/** 解析可清除的 http(s) origin；空白页 / 非法 URL 返回 null */
function normalizeClearOrigin(raw: string | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null
  try {
    const u = new URL(raw.trim())
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.origin
  } catch {
    return null
  }
}

type StorageKind =
  | 'cookies'
  | 'filesystem'
  | 'indexdb'
  | 'localstorage'
  | 'shadercache'
  | 'websql'
  | 'serviceworkers'
  | 'cachestorage'

/**
 * 按选项清除项目预览分区浏览数据
 * - options.all：整分区
 * - 否则按 options.origin 只清该源
 * 调用方须先销毁所有使用该分区的 <webview>，否则可能原生崩溃
 */
export async function clearProjectsPreviewSession(
  options: ClearPreviewCacheOptions = {}
): Promise<void> {
  const clearAll = Boolean(options.all)
  const origin = clearAll ? null : normalizeClearOrigin(options.origin)
  const cache = Boolean(options.cache)
  const cookies = Boolean(options.cookies)
  const localStorage = Boolean(options.localStorage)
  const indexedDB = Boolean(options.indexedDB)
  const serviceWorkers = Boolean(options.serviceWorkers)

  if (!clearAll && !origin) {
    writeDiag('preview-session.clear skip: missing/invalid origin')
    return
  }

  if (!cache && !cookies && !localStorage && !indexedDB && !serviceWorkers) {
    writeDiag('preview-session.clear skip: nothing selected')
    return
  }

  const ses = session.fromPartition(PROJECTS_PREVIEW_PARTITION)
  writeDiag('preview-session.clear start', {
    all: clearAll,
    origin,
    cache,
    cookies,
    localStorage,
    indexedDB,
    serviceWorkers
  })

  const dataTypes: string[] = []
  if (cache) {
    dataTypes.push('cache', 'fileSystems')
  }
  if (cookies) dataTypes.push('cookies')
  if (localStorage) dataTypes.push('localStorage')
  if (indexedDB) dataTypes.push('indexedDB')
  if (serviceWorkers) dataTypes.push('serviceWorkers')

  const clearData = (
    ses as unknown as {
      clearData?: (opts?: {
        dataTypes?: string[]
        origins?: string[]
        originMatchingMode?: string
      }) => Promise<void>
    }
  ).clearData
  if (typeof clearData === 'function' && dataTypes.length) {
    try {
      if (clearAll) {
        await clearData.call(ses, { dataTypes })
      } else {
        // origin-in-all-contexts：iframe / 第三方上下文里同源数据一并清掉
        await clearData.call(ses, {
          dataTypes,
          origins: [origin!],
          originMatchingMode: 'origin-in-all-contexts'
        })
      }
      writeDiag('preview-session.clear done via clearData', { all: clearAll, origin })
      return
    } catch (err) {
      writeDiag('preview-session.clearData failed, fallback', err)
    }
  }

  // 整分区时可清 HTTP 磁盘缓存；按 origin 时不调 clearCache，避免误清全部分区
  if (cache && clearAll) {
    try {
      await ses.clearCache()
    } catch (err) {
      writeDiag('preview-session.clearCache failed', err)
    }
  }

  const storages: StorageKind[] = []
  if (cache) {
    if (clearAll) storages.push('cachestorage', 'shadercache', 'filesystem')
    else storages.push('cachestorage', 'filesystem')
  }
  if (cookies) storages.push('cookies')
  if (localStorage) storages.push('localstorage')
  if (indexedDB) storages.push('indexdb')
  if (serviceWorkers) storages.push('serviceworkers', 'cachestorage')

  if (storages.length) {
    try {
      await ses.clearStorageData(
        clearAll
          ? { storages: [...new Set(storages)] }
          : { origin: origin!, storages: [...new Set(storages)] }
      )
    } catch (err) {
      writeDiag('preview-session.clearStorageData failed', err)
    }
  }

  writeDiag('preview-session.clear done via fallback', { all: clearAll, origin })
}
