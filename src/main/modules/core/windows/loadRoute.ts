import { BrowserWindow } from 'electron'
import { join } from 'path'

/** 各窗口共用：按 hash 路由加载渲染页（打包后 __dirname 为 out/main） */
export function loadRoute(win: BrowserWindow, route: string): void {
  const path = route.startsWith('/') ? route : `/${route}`
  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#${path}`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: path })
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
