import { Menu, nativeImage, Tray, app } from 'electron'
import { join } from 'path'

export interface TrayState {
  launchAtLogin: boolean
}

export interface TrayActions {
  /** 左键：显示或置顶功能面板（不关闭） */
  showPanel: () => void
  /** 右键菜单：显示 / 隐藏切换 */
  togglePanel: () => void
  openSettings: () => void
  toggleLogin: () => void
  quit: () => void
}

/**
 * 托盘管理
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
      // macOS：左键显示/置顶面板，右键菜单
      this.tray.on('click', () => this.actions.showPanel())
      this.tray.on('right-click', () => this.tray?.popUpContextMenu(this.buildMenu()))
    } else {
      this.tray.setContextMenu(this.buildMenu())
      this.tray.on('click', () => this.actions.showPanel())
    }
  }

  rebuild(): void {
    if (!this.tray) return
    // Windows / Linux：常驻 contextMenu 需重建；macOS 右键时现建菜单，这里无操作
    if (process.platform === 'darwin') return
    this.tray.setContextMenu(this.buildMenu())
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }

  private buildMenu(): Menu {
    const state = this.getState()
    return Menu.buildFromTemplate([
      {
        label: '显示 / 隐藏面板',
        click: () => this.actions.togglePanel()
      },
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
    ])
  }
}
