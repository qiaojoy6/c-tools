import { Menu, app, type MenuItemConstructorOptions } from 'electron'
import type { AppConfig, ConfigPatch } from '@shared/types'

/**
 * 应用菜单：保留 Edit（系统复制粘贴依赖菜单 role），View 含开发开关；无 File / Window
 */
export function setupAppMenu(deps: {
  getConfig: () => AppConfig
  updateConfig: (patch: ConfigPatch) => void
}): void {
  const rebuild = (): void => {
    const hideOnBlur = deps.getConfig().window.hideOnBlur

    // Edit role 必须保留，否则 webview / 输入框里 ⌘C ⌘V 等全部失效
    const editMenu: MenuItemConstructorOptions = {
      label: 'Edit',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'pasteAndMatchStyle', label: '粘贴并匹配样式' },
        { role: 'delete', label: '删除' },
        { role: 'selectAll', label: '全选' }
      ]
    }

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
        { role: 'reload', label: '刷新' },
        { role: 'forceReload', label: '强制刷新' },
        { role: 'toggleDevTools', label: '打开开发者工具' }
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

    template.push(editMenu, viewMenu)
    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  }

  rebuild()
}
