# c-tools 功能文档

按模块记录已有功能与对应源码目录。新增功能时，在对应模块补功能条目；有新文件则补到「相关文件」。

---

## core

### 功能

- 独立剪贴板窗口（`/clipboard`）：无边框置顶浮层、失焦隐藏、顶部居中、ESC 关闭；快捷键呼出；与功能面板可同时存在
- 功能面板窗口（`/panel`）：`titleBarStyle: hidden` + 原生窗控（macOS 交通灯 / Win·Linux `titleBarOverlay`），通栏自定义表头；托盘 / 程序坞唤起；失焦隐藏由 `window.hideOnBlur` 控制（View 菜单可开关）
- 面板左侧图标轨道切换模块（可扩展；当前：剪贴板、项目）；底部打开设置
- 独立设置窗口
- 应用菜单保留 Edit（系统复制/粘贴依赖）与 View；无 File / Window；View 可开关「点击空白区域隐藏窗口」
- 托盘常驻（关窗口不退出）
- 配置本地持久化
- 开机自启
- 单实例（二次启动 / 点程序坞唤起功能面板；唤起时不做同步采焦，避免卡顿需连点）
- 粘贴：先写入系统剪贴板，再关窗并模拟粘贴；自动粘贴失败时提示手动 Ctrl+V / ⌘V（不再因焦点失败而跳过写入）
- Windows 粘贴：统一模拟 Ctrl+V（SendInput / keybd_event；不用 WM_PASTE 抢先返回，避免 VS Code 等误判成功）；koffi 不可用时回退 PowerShell SendKeys
- Windows 焦点：快捷键瞬间同步采 hwnd；hide 时 `setFocusable(false)` 强制还焦；hide 前 `AllowSetForegroundWindow`；激活后只要前台不在本进程即模拟粘贴（不过严要求原 hwnd）

### 相关文件

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

---

## clipboard

### 功能

- 后台监听系统剪贴板（纯文本、图片）
- 历史记录：去重、置顶、本地持久化、条数上限、过期清理
- 收藏：独立持久化，与历史解耦；历史删除/清空不影响收藏；取消收藏即删除
- 双入口：快捷键 → 独立浮层仅显示剪贴板（ESC 关闭）；托盘 → 功能面板（原生 titleBarStyle 窗控 + 通栏自定义表头，ESC 不关窗）
- 面板内剪贴板模块：双击 / Enter 粘贴后仍关闭窗口
- 搜索优先、类型筛选芯片（全部/文本/图片/收藏）、列表展示
- 打开浮层不自动聚焦搜索；敲击英文/数字时才聚焦并输入；⌘/Ctrl+F 手动聚焦
- ← / → 未聚焦搜索时切换类型筛选；聚焦后为移动光标；↑ / ↓ 切换列表
- 文本超长默认收起 3 行，可展开/收起
- 图片缩略图，hover 预览原图
- 双击 / Enter 粘贴到原光标处；空格多选、Shift 批量粘贴
- 单条删除、一键清空历史（不影响收藏）
- 粘贴后关闭浮层；独立窗可用 ESC / 失焦关闭；功能面板内嵌时 ESC 不关窗
- 设置入口在功能面板左侧轨道底部

### 相关文件

- `src/main/modules/clipboard/` — watcher / history / favorites / paste / ipc
- `src/renderer/src/pages/ClipboardPage.vue` — 剪贴板内容（独立路由与面板内嵌共用）
- `src/renderer/src/modules/clipboard/` — 卡片、useHistory
- `src/preload/modules/clipboard.ts`
- `src/shared/modules/clipboard.ts`

---

## projects

### 功能

- 功能面板「项目」模块：顶栏固定「首页」+ 已启动项目横向圆角页签
- 首页：工作区行（点「工作区」选根目录；可打开 / 重新扫描 / 删除工作区配置）+ 项目行（名称芯片可编辑、路径、启动 Switch）
- 扫描：一级子目录含 `index.html` / `dist/index.html`；若工作区根自身含入口也识别为项目（id `.`）
- 可编辑显示名、入口相对路径；写入本地配置 `projects.overrides`
- Switch 开：主进程起本地静态 HTTP（随机端口，SPA 回退）并打开对应页签全屏 `<webview>`
- 若构建配置了 base，可在编辑里填「基础路径」，预览 URL 挂在此前缀下并按此前缀解析静态资源
- 预览 webview 支持右键菜单：刷新 / 复制粘贴 / 检查 / 打开 guest 开发者工具（应用菜单里的 DevTools 只作用于宿主页）
- Switch 关 / 关页签：停服务；同项目不重复开；切面板模块保留；退出停全部；重启不恢复运行态
- 工作区路径与 overrides 持久化；打开后自动按上次工作区扫描

### 相关文件

- `src/main/modules/projects/` — scan / staticServer / runtime / ipc
- `src/main/modules/core/webviewContextMenu.ts` — webview guest 右键菜单
- `src/preload/modules/projects.ts`
- `src/shared/modules/projects.ts`
- `src/renderer/src/pages/ProjectsPage.vue`
- `src/renderer/src/modules/projects/` — composables、列表与页签、ProjectWebview
- `src/renderer/src/modules/panel/tabs.ts` — 面板模块注册
- `src/main/modules/core/windows/panelWindow.ts` — `webviewTag`

---

## settings

### 功能

- 独立设置窗口，左侧按模块 Tab 切换（通用 / 剪贴板，可扩展）
- 自定义呼出快捷键（可恢复默认）
- 最大保存条数
- 过期自动清理周期
- 开机自启
- 退出时清空记录
- 启动时清空记录

### 相关文件

- `src/renderer/src/pages/SettingsPage.vue`
- `src/renderer/src/modules/settings/tabs.ts` — 模块 Tab 注册
- `src/renderer/src/modules/settings/components/` — GeneralSettings / ClipboardSettings / HotkeyInput
- `src/main/modules/core/windows/settingsWindow.ts`
- `src/shared/config.ts` — `DEFAULT_TOGGLE_PANEL_SHORTCUT`
