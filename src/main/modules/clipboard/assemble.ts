import type { ConfigManager } from '../../config'
import { ClipboardImageStore, installClipboardImageProtocol } from './imageStore'
import { ClipboardWatcher } from './watcher'
import { FavoritesManager } from './favorites'
import { HistoryManager } from './history'
import { PasteService } from './paste'
import { broadcastFavorites, broadcastHistory } from './broadcast'

/** 剪贴板内部栈：Feature 与 HostServices 共用 */
export type ClipboardStack = {
  images: ClipboardImageStore
  history: HistoryManager
  favorites: FavoritesManager
  paste: PasteService
  watcher: ClipboardWatcher
}

/**
 * 组装剪贴板：图片协议、历史/收藏、监听与粘贴
 * 不安装截屏协议（截屏 Feature 自己挂）
 */
export function assembleClipboard(config: ConfigManager): ClipboardStack {
  const images = new ClipboardImageStore()
  installClipboardImageProtocol(images)

  // 用 bag 打破 history ↔ favorites 与 reconcile 的初始化顺序
  const bag: {
    history?: HistoryManager
    favorites?: FavoritesManager
  } = {}

  const reconcileImages = (): void => {
    const refs = [
      ...(bag.history?.referencedFileIds() ?? []),
      ...(bag.favorites?.referencedFileIds() ?? [])
    ]
    images.purgeOrphans(refs)
  }

  const paste = new PasteService(images)

  bag.history = new HistoryManager(
    () => config.get(),
    (records) => broadcastHistory(records),
    reconcileImages
  )

  bag.favorites = new FavoritesManager((records) => broadcastFavorites(records), reconcileImages)

  bag.favorites.init()
  bag.history.init()
  reconcileImages()

  const watcher = new ClipboardWatcher(
    () => config.get().clipboard.pollIntervalMs,
    (capture) => bag.history!.add(capture),
    images
  )
  watcher.start()
  paste.onClipboardWritten = () => watcher.syncBaseline()

  return {
    images,
    history: bag.history,
    favorites: bag.favorites,
    paste,
    watcher
  }
}
