# settings

## 功能

- 独立设置窗口，左侧按模块 Tab 切换（通用 / 剪贴板，可扩展）
- 自定义呼出快捷键（可恢复默认）
- 最大保存条数
- 过期自动清理周期
- 开机自启
- 退出时清空记录
- 启动时清空记录

## 相关文件

- `src/renderer/src/pages/SettingsPage.vue`
- `src/renderer/src/modules/settings/tabs.ts` — 模块 Tab 注册
- `src/renderer/src/modules/settings/components/` — GeneralSettings / ClipboardSettings / HotkeyInput
- `src/main/modules/core/windows/settingsWindow.ts`
- `src/shared/config.ts` — `DEFAULT_TOGGLE_PANEL_SHORTCUT`
