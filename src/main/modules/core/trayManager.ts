import { Menu, nativeImage, Tray, app, type MenuItemConstructorOptions } from 'electron'
import { join } from 'path'
import type { ShortcutConfig } from '@shared/types'

export type TrayRecordingState = 'idle' | 'recording' | 'paused'

export interface TrayState {
  launchAtLogin: boolean
  /** 录屏状态（用于菜单文案；亦传给 Feature 托盘贡献） */
  recordingState: TrayRecordingState
  /** 当前快捷键（空字符串则菜单不显示加速键） */
  shortcuts: ShortcutConfig
}

/** 托盘菜单构建上下文（rebuild 时传入 Feature 贡献） */
export type TrayMenuContext = {
  shortcuts: ShortcutConfig
  recordingState: TrayRecordingState
}

/**
 * Feature 贡献的托盘菜单段。
 * order 越小越靠前（壳「显隐面板」之后、设置/退出之前）。
 */
export type TrayContribution = {
  order: number
  items: (menuCtx: TrayMenuContext) => MenuItemConstructorOptions[]
}

/** 壳层托盘动作（面板 / 设置 / 自启 / 退出）；业务入口由 Feature 贡献 */
export interface TrayShellActions {
  showPanel: () => void
  togglePanel: () => void
  openSettings: () => void
  toggleLogin: () => void
  quit: () => void
}

/** 有快捷键时带上 accelerator，供托盘菜单右侧展示 */
export function trayMenuItem(
  label: string,
  click: () => void,
  accelerator?: string
): MenuItemConstructorOptions {
  const accel = accelerator?.trim()
  return accel ? { label, accelerator: accel, click } : { label, click }
}

/**
 * 托盘管理。菜单 = 壳（显隐面板）+ Feature 贡献 + 壳（自启/设置/退出）。
 * 录制中 macOS 左键弹出控制菜单；空闲时显示面板。
 */
export class TrayManager {
  private tray: Tray | null = null
  private getState: () => TrayState
  private shell: TrayShellActions
  private getContributions: () => TrayContribution[]

  constructor(
    getState: () => TrayState,
    shell: TrayShellActions,
    getContributions: () => TrayContribution[]
  ) {
    this.getState = getState
    this.shell = shell
    this.getContributions = getContributions
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
        this.shell.showPanel()
      })
      this.tray.on('right-click', () => this.tray?.popUpContextMenu(this.buildMenu()))
    } else {
      this.tray.setContextMenu(this.buildMenu())
      this.tray.on('click', () => this.shell.showPanel())
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
    const menuCtx: TrayMenuContext = {
      shortcuts: state.shortcuts,
      recordingState: state.recordingState
    }

    const items: MenuItemConstructorOptions[] = [
      { label: '显隐面板', click: () => this.shell.togglePanel() }
    ]

    for (const contrib of this.getContributions()) {
      items.push(...contrib.items(menuCtx))
    }

    items.push(
      { type: 'separator' },
      {
        label: '开机自启',
        type: 'checkbox',
        checked: state.launchAtLogin,
        click: () => this.shell.toggleLogin()
      },
      { type: 'separator' },
      {
        label: '设置',
        click: () => this.shell.openSettings()
      },
      {
        label: '退出',
        click: () => this.shell.quit()
      }
    )

    return Menu.buildFromTemplate(items)
  }
}
