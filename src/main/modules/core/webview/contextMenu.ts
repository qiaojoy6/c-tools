import { BrowserWindow, Menu, clipboard, shell, webContents, type IpcMainInvokeEvent } from 'electron'
import type { WebviewContextMenuPayload } from '@shared/types'

/**
 * 弹出 webview guest 右键菜单（检查 / 开发者工具等）
 * Electron 默认不为 webview 提供系统菜单，需自行 popup
 */
export function popupWebviewContextMenu(
  event: IpcMainInvokeEvent,
  payload: WebviewContextMenuPayload
): void {
  const wc = webContents.fromId(payload.webContentsId)
  // 仅允许操作 webview guest，避免误控宿主或其他窗口
  if (!wc || wc.isDestroyed() || wc.getType() !== 'webview') return

  const flags = payload.editFlags ?? {}
  const hasSelection = Boolean(payload.selectionText?.trim())
  const linkURL = payload.linkURL?.trim() || ''
  const srcURL = payload.srcURL?.trim() || ''

  const menu = Menu.buildFromTemplate([
    {
      label: '刷新',
      click: () => {
        if (!wc.isDestroyed()) wc.reload()
      }
    },
    {
      label: '强制刷新',
      click: () => {
        if (!wc.isDestroyed()) wc.reloadIgnoringCache()
      }
    },
    { type: 'separator' },
    {
      label: '复制',
      enabled: flags.canCopy ?? hasSelection,
      click: () => {
        if (!wc.isDestroyed()) wc.copy()
      }
    },
    {
      label: '粘贴',
      enabled: flags.canPaste ?? Boolean(payload.isEditable),
      click: () => {
        if (!wc.isDestroyed()) wc.paste()
      }
    },
    // {
    //   label: '全选',
    //   enabled: flags.canSelectAll ?? true,
    //   click: () => {
    //     if (!wc.isDestroyed()) wc.selectAll()
    //   }
    // },
    ...(linkURL
      ? ([
          { type: 'separator' as const },
          {
            label: '复制链接',
            click: () => clipboard.writeText(linkURL)
          },
          {
            label: '在新页签中打开链接',
            click: () => {
              const host = wc.hostWebContents
              if (host && !host.isDestroyed()) {
                host.send('webview:window-open', {
                  webContentsId: wc.id,
                  url: linkURL
                })
              }
            }
          },
          {
            label: '在浏览器中打开链接',
            click: () => {
              void shell.openExternal(linkURL)
            }
          }
        ] as const)
      : []),
    ...(srcURL && srcURL.startsWith('http')
      ? ([
          { type: 'separator' as const },
          {
            label: '复制图片地址',
            click: () => clipboard.writeText(srcURL)
          }
        ] as const)
      : []),
    { type: 'separator' },
    {
      label: '检查',
      click: () => {
        if (!wc.isDestroyed()) wc.inspectElement(payload.x, payload.y)
      }
    }
  ])

  const win = BrowserWindow.fromWebContents(event.sender)
  menu.popup({ window: win ?? undefined })
}
