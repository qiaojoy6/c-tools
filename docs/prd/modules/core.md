# core

## 功能

- 独立剪贴板窗口（`/clipboard`）：无边框置顶浮层、失焦隐藏、顶部居中、ESC 关闭；快捷键呼出
- 功能面板窗口（`/panel`）：`titleBarStyle: hidden` + 原生窗控（macOS 交通灯 / Win·Linux `titleBarOverlay`），通栏自定义表头；托盘呼出；失焦隐藏由 `window.hideOnBlur` 控制（View 菜单可开关）
- 面板左侧图标轨道切换模块（可扩展；当前仅剪贴板）；底部打开设置
- 独立设置窗口
- 应用菜单精简为 View（无 File / Edit / Window）；View 可开关「点击空白区域隐藏窗口」
- 托盘常驻（关窗口不退出）
- 配置本地持久化
- 开机自启
- 单实例（二次启动唤起独立剪贴板）
- 粘贴前恢复原应用焦点并关闭对应窗口（macOS；面板内剪贴板双击粘贴同样关闭）

## 相关文件

- `src/main/modules/core/windows/` — ClipboardWindow / PanelWindow / SettingsWindow / WindowManager
- `src/main/modules/core/` — tray / shortcut / storage / ipc / appMenu
- `src/main/config/` — 默认配置与读写
- `src/renderer/src/pages/PanelPage.vue` — 功能面板壳（表头 + 左侧模块 Tab）
- `src/renderer/src/modules/panel/components/WindowTitleBar.vue` — 通栏自定义表头（无自绘窗控）
- `src/renderer/src/pages/ClipboardPage.vue` — 独立剪贴板入口（亦内嵌于面板）
- `src/renderer/src/modules/panel/tabs.ts` — 面板模块注册
- `src/renderer/src/router/index.ts` — `/clipboard` / `/panel` / `/settings`
- `src/preload/modules/app.ts`
- `src/shared/config.ts`
