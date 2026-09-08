import { app } from 'electron'
import type { WebviewWindowOpenPayload } from '@shared/types'
import { writeDiag } from './crashGuard'

/**
 * 拦截 webview guest 的 window.open / target=_blank：
 * 不弹系统窗，改为通知宿主渲染进程自行开页签
 * 须在 app ready 后调用一次；guest 需带 allowpopups 才会走到此 handler
 */
export function installWebviewWindowOpenHandler(): void {
  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() !== 'webview') return

    contents.setWindowOpenHandler(({ url }) => {
      try {
        if (!url || contents.isDestroyed()) return { action: 'deny' }
        const host = contents.hostWebContents
        if (host && !host.isDestroyed()) {
          const payload: WebviewWindowOpenPayload = {
            webContentsId: contents.id,
            url
          }
          host.send('webview:window-open', payload)
        }
      } catch (err) {
        writeDiag('webview.window-open handler error', err)
      }
      return { action: 'deny' }
    })
  })
}
