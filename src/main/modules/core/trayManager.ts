import { Menu, nativeImage, Tray, app } from 'electron'
import { join } from 'path'

export type TrayRecordingState = 'idle' | 'recording' | 'paused'

export interface TrayState {
  launchAtLogin: boolean
  /** 录屏状态（用于菜单文案） */
  recordingState: TrayRecordingState
}

export interface TrayActions {
  /** 左键：显示或置顶功能面板（不关闭） */
  showPanel: () => void
  /** 右键菜单：显示 / 隐藏切换 */
  togglePanel: () => void
  openSettings: () => void
  toggleLogin: () => void
  /** 开始截屏 */
  startScreenshot: () => void
  /** 区域录屏（框选 / 点选应用窗） */
  startRegionRecord: () => void
  /** 全屏录屏（弹窗选屏，列表来自 Rust xcap） */
  startFullscreenRecord: () => void
  /** 录制/暂停中则停止 */
  stopRecord: () => void
  /** 录制中暂停 / 暂停中继续 */
  togglePauseRecord: () => void
  quit: () => void
}

/**
 * 托盘管理。录制中菜单可暂停/停止（全屏主交互为悬浮球）。
 */
export class TrayManager {
  private tray: Tray | null = null
  private getState: () => TrayState
  private actions: TrayActions

  constructor(getState: () => TrayState, actions: TrayActions) {
    this.getState = getState
    this.actions = actions
  }

  create(): void {
    const iconPath = join(app.getAppPath(), 'resources/icon.png')
    let icon = nativeImage.createFromPath(iconPath)
    if (process.platform === 'darwin') {
      icon = icon.resize({ width: 16, height: 16 })
    }
    this.tray = new Tray(icon)
    this.tray.setToolTip('c-tools')

    if (process.platform === 'darwin') {
      // 录制中左键弹出控制菜单；空闲时显示面板
      this.tray.on('click', () => {
        if (this.getState().recordingState !== 'idle') {
          this.tray?.popUpContextMenu(this.buildMenu())
          return
        }
        this.actions.showPanel()
      })
      this.tray.on('right-click', () => this.tray?.popUpContextMenu(this.buildMenu()))
    } else {
      this.tray.setContextMenu(this.buildMenu())
      this.tray.on('click', () => this.actions.showPanel())
    }
  }

  rebuild(): void {
    if (!this.tray) return
    // Windows / Linux：常驻 contextMenu 需重建；macOS 右键时现建菜单
    if (process.platform !== 'darwin') {
      this.tray.setContextMenu(this.buildMenu())
    }
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }

  private buildMenu(): Menu {
    const state = this.getState()
    const rs = state.recordingState
    const items: Electron.MenuItemConstructorOptions[] = [
      {
        label: '显示/隐藏面板',
        click: () => this.actions.togglePanel()
      },
      {
        label: '截屏',
        click: () => this.actions.startScreenshot()
      }
    ]

    if (rs === 'idle') {
      items.push({
        label: '区域录屏',
        click: () => this.actions.startRegionRecord()
      })
      items.push({
        label: '全屏录屏',
        click: () => this.actions.startFullscreenRecord()
      })
    } else {
      items.push({
        label: rs === 'paused' ? '继续录屏' : '暂停录屏',
        click: () => this.actions.togglePauseRecord()
      })
      items.push({
        label: '停止录屏',
        click: () => this.actions.stopRecord()
      })
    }

    items.push(
      { type: 'separator' },
      {
        label: '开机自启',
        type: 'checkbox',
        checked: state.launchAtLogin,
        click: () => this.actions.toggleLogin()
      },
      { type: 'separator' },
      {
        label: '设置',
        click: () => this.actions.openSettings()
      },
      {
        label: '退出',
        click: () => this.actions.quit()
      }
    )

    return Menu.buildFromTemplate(items)
  }
}
