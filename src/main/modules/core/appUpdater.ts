/**
 * 自动更新（electron-updater）
 * - 仅打包后检查；启动稍后自动查一次
 * - macOS：未签名时自动安装会失败 → 只提示，引导到 GitHub Releases 手动下载
 * - 其它平台：有更新则静默下载，完成后通知；设置页可重启安装
 */
import { BrowserWindow, Notification, app, shell } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateStatus } from '@shared/types'
import { writeDiag } from './crashGuard'

const { autoUpdater } = electronUpdater

/** 启动后延迟检查，避开冷启动抢带宽 */
const STARTUP_CHECK_DELAY_MS = 5_000

/** mac 无签名时手动下载页 */
const GITHUB_RELEASES_URL = 'https://github.com/qiaojoy6/c-tools/releases/latest'

/** macOS 暂走手动下载（需 Developer ID 后可改回自动安装） */
const MANUAL_DOWNLOAD = process.platform === 'darwin'

let status: UpdateStatus = {
  state: 'idle',
  currentVersion: app.getVersion(),
  canUpdate: app.isPackaged,
  manualDownload: MANUAL_DOWNLOAD
}

let started = false

export function getUpdateStatus(): UpdateStatus {
  return {
    ...status,
    currentVersion: app.getVersion(),
    canUpdate: app.isPackaged,
    manualDownload: MANUAL_DOWNLOAD,
    releaseUrl: MANUAL_DOWNLOAD ? GITHUB_RELEASES_URL : status.releaseUrl
  }
}

/** whenReady 后调用：挂事件 + 定时自动检查 */
export function startAppUpdater(): void {
  if (started) return
  started = true

  status.currentVersion = app.getVersion()
  status.canUpdate = app.isPackaged
  status.manualDownload = MANUAL_DOWNLOAD

  // mac 不自动下包，避免签名校验失败后甩长错误
  autoUpdater.autoDownload = !MANUAL_DOWNLOAD
  autoUpdater.autoInstallOnAppQuit = !MANUAL_DOWNLOAD
  // debug 极吵且可能含大段内容，只落 info/warn/error；debug 仅控制台
  autoUpdater.logger = {
    info: (m) => writeDiag('updater.info', String(m)),
    warn: (m) => writeDiag('updater.warn', String(m)),
    error: (m) => writeDiag('updater.error', String(m)),
    debug: (m) => console.debug('[updater]', m)
  }

  autoUpdater.on('checking-for-update', () => {
    setStatus({ state: 'checking', message: '正在检查更新…' })
  })

  autoUpdater.on('update-available', (info) => {
    if (MANUAL_DOWNLOAD) {
      setStatus({
        state: 'available',
        availableVersion: info.version,
        releaseUrl: GITHUB_RELEASES_URL,
        message: `发现新版本 ${info.version}，请到 GitHub 下载安装`
      })
      return
    }
    setStatus({
      state: 'available',
      availableVersion: info.version,
      message: `发现新版本 ${info.version}，开始下载…`
    })
    notify('发现新版本', `正在下载 ${info.version}`)
  })

  autoUpdater.on('update-not-available', (info) => {
    setStatus({
      state: 'not-available',
      availableVersion: info.version,
      message: '已是最新版本'
    })
  })

  autoUpdater.on('download-progress', (p) => {
    if (MANUAL_DOWNLOAD) return
    setStatus({
      state: 'downloading',
      percent: Math.round(p.percent),
      message: `下载中 ${Math.round(p.percent)}%`
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    if (MANUAL_DOWNLOAD) return
    setStatus({
      state: 'downloaded',
      availableVersion: info.version,
      percent: 100,
      message: `新版本 ${info.version} 已下载，重启后安装`
    })
    notify('更新已就绪', `重启即可安装 ${info.version}`)
  })

  autoUpdater.on('error', (err) => {
    const message = err?.message || String(err)
    setStatus({ state: 'error', message })
    writeDiag('updater.error.event', message)
  })

  if (!app.isPackaged) {
    setStatus({ state: 'idle', message: '开发模式不检查更新' })
    return
  }

  setTimeout(() => {
    void checkForUpdates()
  }, STARTUP_CHECK_DELAY_MS)
}

/** 手动 / 自动检查；返回最新状态 */
export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) {
    setStatus({ state: 'idle', message: '开发模式请用打包产物验证更新' })
    return getUpdateStatus()
  }
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    setStatus({ state: 'error', message })
    writeDiag('updater.check failed', message)
  }
  return getUpdateStatus()
}

/** 打开 GitHub Releases（mac 手动下载） */
export async function openUpdateReleasePage(): Promise<boolean> {
  const url = status.releaseUrl || GITHUB_RELEASES_URL
  try {
    await shell.openExternal(url)
    return true
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    writeDiag('updater.openRelease failed', message)
    return false
  }
}

/** 下载完成后退出并安装（mac 手动模式下不可用） */
export function quitAndInstallUpdate(): boolean {
  if (MANUAL_DOWNLOAD || status.state !== 'downloaded') return false
  writeDiag('updater.quitAndInstall', status.availableVersion)
  // isSilent=false, isForceRunAfter=true
  autoUpdater.quitAndInstall(false, true)
  return true
}

function setStatus(patch: Partial<UpdateStatus>): void {
  status = {
    ...status,
    ...patch,
    currentVersion: app.getVersion(),
    canUpdate: app.isPackaged,
    manualDownload: MANUAL_DOWNLOAD
  }
  broadcastStatus()
}

function broadcastStatus(): void {
  const payload = getUpdateStatus()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('updater:status', payload)
  }
}

function notify(title: string, body: string): void {
  try {
    if (!Notification.isSupported()) return
    new Notification({ title: `c-tools · ${title}`, body }).show()
  } catch {
    /* ignore */
  }
}
