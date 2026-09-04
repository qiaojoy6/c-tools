import type { AppConfig } from '@shared/types'
import { PanelWindow } from './panelWindow'
import { SettingsWindow } from './settingsWindow'

/**
 * 窗口枢纽：组合主面板与其它窗口，对外保持稳定 API。
 * 新增窗口时在此挂载对应 Controller，勿把逻辑堆回单文件。
 */
export class WindowManager {
  private quitting = false
  readonly panel: PanelWindow
  readonly settings: SettingsWindow

  constructor(getConfig: () => AppConfig) {
    const isQuitting = (): boolean => this.quitting
    this.panel = new PanelWindow(getConfig, isQuitting)
    this.settings = new SettingsWindow(isQuitting)
  }

  markQuitting(): void {
    this.quitting = true
  }

  get panelWindow() {
    return this.panel.browserWindow
  }

  get settingsWindow() {
    return this.settings.browserWindow
  }

  get onSettingsClosed(): (() => void) | null {
    return this.settings.onClosed
  }

  set onSettingsClosed(fn: (() => void) | null) {
    this.settings.onClosed = fn
  }

  isVisible(): boolean {
    return this.panel.isVisible()
  }

  createPanel() {
    return this.panel.create()
  }

  showPanel(): void {
    this.panel.show()
  }

  hidePanel(): void {
    this.panel.hide()
  }

  togglePanel(): void {
    this.panel.toggle()
  }

  showSettings(): void {
    this.settings.show()
  }

  hideSettings(): void {
    this.settings.hide()
  }

  restorePreviousFocus(): Promise<boolean> {
    return this.panel.restorePreviousFocus()
  }
}
