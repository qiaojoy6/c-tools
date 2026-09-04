# core

## 功能

- 无边框置顶浮层窗口，顶部居中
- 同一浮层双形态：独立剪贴板（`/clipboard`，无左侧轨）与功能面板（`/panel`，左侧模块轨）
- 全局快捷键呼出/隐藏独立剪贴板
- 托盘左键呼出功能面板
- 面板左侧图标轨道切换模块（可扩展；当前仅剪贴板）；底部打开设置
- 独立设置窗口
- 托盘常驻（关窗口不退出）
- 配置本地持久化
- 开机自启
- 单实例（二次启动唤起独立剪贴板）
- 失焦隐藏浮层；粘贴前恢复原应用焦点（macOS）

## 相关文件

- `src/main/modules/core/windows/` — PanelWindow / SettingsWindow / WindowManager
- `src/main/modules/core/` — tray / shortcut / storage / ipc
- `src/main/config/` — 默认配置与读写
- `src/renderer/src/pages/PanelPage.vue` — 功能面板壳（左侧模块 Tab）
- `src/renderer/src/pages/ClipboardPage.vue` — 独立剪贴板入口（亦内嵌于面板）
- `src/renderer/src/modules/panel/tabs.ts` — 面板模块注册
- `src/renderer/src/router/index.ts` — `/clipboard` / `/panel` / `/settings`
- `src/preload/modules/app.ts`
- `src/shared/config.ts`
