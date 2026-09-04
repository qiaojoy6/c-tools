import { Menu, app, type MenuItemConstructorOptions } from 'electron'
import type { AppConfig, ConfigPatch } from '@shared/types'

/**
 * 应用菜单：去掉 File / Edit / Window，仅保留 View（开发用开关）
 */
export function setupAppMenu(deps: {
  getConfig: () => AppConfig
  updateConfig: (patch: ConfigPatch) => void
}): void {
  const rebuild = (): void => {
    const hideOnBlur = deps.getConfig().window.hideOnBlur

    const viewMenu: MenuItemConstructorOptions = {
      label: 'View',
      submenu: [
        {
          label: '点击空白区域隐藏窗口',
          type: 'checkbox',
          checked: hideOnBlur,
          click: (item) => {
            deps.updateConfig({ window: { hideOnBlur: item.checked } })
            rebuild()
          }
        },
        { type: 'separator' },
        { role: 'reload',label: '刷新' },
        { role: 'forceReload',label: '强制刷新' },
        { role: 'toggleDevTools',label: '打开开发者工具' }
      ]
    }

    const template: MenuItemConstructorOptions[] = []

    // macOS 左侧应用名菜单（关于 / 退出等）
    if (process.platform === 'darwin') {
      template.push({
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      })
    }

    template.push(viewMenu)
    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  }

  rebuild()
}
