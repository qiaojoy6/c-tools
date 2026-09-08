import { app, BrowserWindow, webContents, type WebContents } from 'electron'

function getGuest(id: number) {
  const wc = webContents.fromId(id)
  if (!wc || wc.isDestroyed() || wc.getType() !== 'webview') return null
  return wc
}

/** 关闭指定 guest 已打开的开发者工具窗 */
export function closeGuestDevTools(guestId: number): boolean {
  const guest = getGuest(guestId)
  if (!guest) return false
  try {
    if (guest.isDevToolsOpened()) guest.closeDevTools()
    return true
  } catch {
    return false
  }
}

const CSP_IGNORE_HINT = [
  '%c[c-tools] 可忽略上方 Content-Security-Policy（CSP）相关报错/警告，一般不影响页面调试。',
  'color:#b45309;background:#fef3c7;font-weight:700;padding:4px 8px;border-radius:4px;'
] as const

/** 打开 DevTools 后在 guest 控制台提示可忽略 CSP */
function warnIgnoreCspInGuestConsole(guest: WebContents): void {
  const [msg, style] = CSP_IGNORE_HINT
  void guest
    .executeJavaScript(
      `console.warn(${JSON.stringify(msg)}, ${JSON.stringify(style)})`,
      true
    )
    .catch(() => {
      // guest 未就绪或已销毁
    })
}

/**
 * guest 被销毁时同步关掉其 DevTools 独立窗（否则会残留）
 * 打开 DevTools 时在控制台提示可忽略 CSP
 * 在 app ready 后调用一次即可
 */
export function installGuestDevToolsLifecycle(): void {
  app.on('web-contents-created', (_e, contents) => {
    contents.on('devtools-opened', () => {
      if (contents.isDestroyed() || contents.getType() !== 'webview') return

      warnIgnoreCspInGuestConsole(contents)

      const tools = contents.devToolsWebContents
      if (!tools || tools.isDestroyed()) return

      const onGuestGone = (): void => {
        try {
          if (tools.isDestroyed()) return
          const win = BrowserWindow.fromWebContents(tools)
          if (win && !win.isDestroyed()) {
            win.close()
            return
          }
          tools.close()
        } catch {
          // ignore
        }
      }

      contents.on('destroyed', onGuestGone)
      contents.once('devtools-closed', () => {
        contents.removeListener('destroyed', onGuestGone)
      })
    })
  })
}
