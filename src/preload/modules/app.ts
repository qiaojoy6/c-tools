import { ipcRenderer } from 'electron'
import type {
  AppConfig,
  ConfigPatch,
  ConfigUpdateResult,
  UpdateStatus,
  WebviewContextMenuPayload,
  WebviewWindowOpenPayload,
  ClearPreviewCacheOptions
} from '@shared/types'

/**
 * 通用 bridge（对应 main/modules/core/ipc.ts）
 * invoke = 请求响应；send = 单向；on* = 订阅主进程推送，返回取消函数
 */
export const appApi = {
  /** config:get */
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke('config:get'),
  /** config:update */
  updateConfig: (patch: ConfigPatch): Promise<ConfigUpdateResult> =>
    ipcRenderer.invoke('config:update', patch),

  /** shortcuts:suspend — 录制快捷键前调用 */
  suspendShortcuts: (): Promise<boolean> => ipcRenderer.invoke('shortcuts:suspend'),
  /** shortcuts:resume — 录制结束/取消/关设置窗时调用 */
  resumeShortcuts: (): Promise<boolean> => ipcRenderer.invoke('shortcuts:resume'),

  /** panel:hide — ESC 关独立浮层（不还焦外部；有面板则回焦面板） */
  hidePanel: (): void => ipcRenderer.send('panel:hide'),
  /** settings:open */
  openSettings: (): void => ipcRenderer.send('settings:open'),

  /** webview:contextMenu — guest 右键菜单（检查 / 开发者工具） */
  popupWebviewContextMenu: (payload: WebviewContextMenuPayload): Promise<void> =>
    ipcRenderer.invoke('webview:contextMenu', payload),

  /** webview:closeDevTools — 关闭指定 guest 的开发者工具 */
  closeWebviewDevTools: (guestId: number): Promise<boolean> =>
    ipcRenderer.invoke('webview:closeDevTools', guestId),

  /** webview:fetchIcon — 远程图标转 data URL（宿主 CSP 不能直接加载外链 img） */
  fetchIconDataUrl: (url: string): Promise<string | null> =>
    ipcRenderer.invoke('webview:fetchIcon', url),

  /** webview:clearPreviewCache — 按 origin 或整分区清除预览浏览数据 */
  clearPreviewCache: (options?: ClearPreviewCacheOptions): Promise<boolean> =>
    ipcRenderer.invoke('webview:clearPreviewCache', options ?? {}),

  /** 订阅：即将清除预览分区（宿主应先卸掉 webview） */
  onPreviewCachePrepare: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('webview:preview-cache-prepare', listener)
    return () => ipcRenderer.removeListener('webview:preview-cache-prepare', listener)
  },
  /** 订阅：预览分区已清除完毕（可挂回 webview） */
  onPreviewCacheDone: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('webview:preview-cache-done', listener)
    return () => ipcRenderer.removeListener('webview:preview-cache-done', listener)
  },

  /** 订阅 webview:window-open（guest 的 target=_blank / window.open） */
  onWebviewWindowOpen: (callback: (payload: WebviewWindowOpenPayload) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: WebviewWindowOpenPayload): void =>
      callback(payload)
    ipcRenderer.on('webview:window-open', listener)
    return () => ipcRenderer.removeListener('webview:window-open', listener)
  },

  /** updater:status */
  getUpdateStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke('updater:status'),
  /** updater:check */
  checkForUpdates: (): Promise<UpdateStatus> => ipcRenderer.invoke('updater:check'),
  /** updater:install — 重启安装已下载更新 */
  installUpdate: (): Promise<boolean> => ipcRenderer.invoke('updater:install'),
  /** updater:open-release — 打开 GitHub Releases（mac 手动下载） */
  openUpdateReleasePage: (): Promise<boolean> => ipcRenderer.invoke('updater:open-release'),
  /** 订阅 updater:status 推送 */
  onUpdateStatus: (callback: (status: UpdateStatus) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, status: UpdateStatus): void =>
      callback(status)
    ipcRenderer.on('updater:status', listener)
    return () => ipcRenderer.removeListener('updater:status', listener)
  },

  /** 订阅 panel:shown（浮层/面板每次显示时刷新列表、重置搜索等） */
  onPanelShown: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('panel:shown', listener)
    return () => ipcRenderer.removeListener('panel:shown', listener)
  },
  /** 订阅 settings:shown（设置窗再次打开时重新拉配置） */
  onSettingsShown: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('settings:shown', listener)
    return () => ipcRenderer.removeListener('settings:shown', listener)
  },
  /** 订阅 config:updated（托盘等改配置时设置页实时同步） */
  onConfigUpdated: (callback: (config: AppConfig) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, config: AppConfig): void => callback(config)
    ipcRenderer.on('config:updated', listener)
    return () => ipcRenderer.removeListener('config:updated', listener)
  }
}

export type AppApi = typeof appApi
