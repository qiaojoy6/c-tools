import type { ConfigManager } from '../config'
import {
  ClipboardImageStore,
  ClipboardWatcher,
  FavoritesManager,
  HistoryManager,
  PasteService,
  installClipboardImageProtocol
} from '../modules/clipboard'
import { installScreenshotImageProtocol } from '../modules/screenshot'
import { broadcastFavorites, broadcastHistory } from './broadcast'

export type ClipboardStack = {
  images: ClipboardImageStore
  history: HistoryManager
  favorites: FavoritesManager
  paste: PasteService
  watcher: ClipboardWatcher
}

/** 组装剪贴板：图片协议、历史/收藏、监听与粘贴 */
export function setupClipboard(config: ConfigManager): ClipboardStack {
  const images = new ClipboardImageStore()
  installClipboardImageProtocol(images)
  installScreenshotImageProtocol()

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
