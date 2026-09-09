# c-tools 功能文档

按模块记录已有功能与对应源码目录。新增功能时，在对应模块补功能条目；有新文件则补到「相关文件」。

---

## core

### 功能

- 独立剪贴板窗口（`/clipboard`）：无边框置顶浮层、在鼠标所在屏顶部居中、ESC 关闭；仅快捷键呼出；失焦隐藏由 `window.hideOnBlur` 控制（View 菜单可开关）；macOS 为 `type: 'panel'`（show/focus 不激活整个应用，不抬起功能面板）
- 功能面板窗口（`/panel`）：`titleBarStyle: hidden` + 原生窗控（macOS 交通灯 / Win·Linux `titleBarOverlay`），通栏自定义表头；托盘左键始终显示/置顶、右键可切换显隐；程序坞 / Cmd+Tab 切回置顶（不关闭）；ESC / 失焦不关闭
- 面板左侧图标轨道切换模块（可扩展；当前：剪贴板、项目）；底部打开设置
- 独立设置窗口
- 应用菜单保留 Edit（系统复制/粘贴依赖）与 View；无 File / Window；View 可开关「点击空白区域隐藏窗口」（作用于独立剪贴板浮层）；刷新 / DevTools 仅开发环境（未打包）提供
- 托盘常驻（关窗口不退出）；右键菜单含「截屏」入口
- 配置本地持久化
- 开机自启（设置与托盘共用配置；变更后同步系统登录项，并推送 `config:updated` 刷新设置窗）
- 单实例（二次启动唤起功能面板；程序坞 / Cmd+Tab 切回立刻置顶且不异步采焦）
- 粘贴：先写入系统剪贴板，再关窗并模拟粘贴；自动粘贴失败时提示手动 Ctrl+V / ⌘V（不再因焦点失败而跳过写入）
- 独立剪贴板回填：贴到呼出前的前台应用；浮层不改动功能面板显隐与层级
- macOS 无辅助功能权限时：只写入系统剪贴板，不模拟回填、不拉起系统设置；每次启动提示一次，粘贴过程不再重复弹通知
- 自动粘贴失败时的「已复制，请手动 ⌘V/Ctrl+V」每个进程只提示一次
- Windows 粘贴：统一模拟 Ctrl+V（SendInput / keybd_event；不用 WM_PASTE 抢先返回，避免 VS Code 等误判成功）；koffi 不可用时回退 PowerShell SendKeys
- Windows 焦点：快捷键瞬间同步采 hwnd；hide 时 `setFocusable(false)` 强制还焦；hide 前 `AllowSetForegroundWindow`；激活后只要前台不在本进程即模拟粘贴（不过严要求原 hwnd）
- 渲染进程日志 `window.logApi` / `import { logApi }`：debug/info/warn/error；先安全序列化再经 `api.logWrite` 打到主进程终端；DevTools 仍打印原始对象
- 主进程意外退出兜底：`logs/diag.log`（未捕获异常、渲染/子进程崩溃、启停）；正常时同步 mirror 到终端；会话心跳检测上次非正常退出；本地 crashReporter minidump（不上传）；终端断管（EIO/EPIPE）只落盘一次、不刷爆日志
- 自动更新：打包后启动自动检查；发现新版本静默下载并通知；设置页可手动检查 / 重启安装（macOS 需签名）

### 相关文件

- `src/main/modules/core/windows/` — ClipboardWindow / PanelWindow / SettingsWindow / WindowManager / focusHandoff（粘贴与截屏共用还焦）
- `src/main/modules/core/windows/focusTarget/` — 前台采焦 / 激活 / 模拟粘贴（`index` 分发；`mac` osascript；`win` koffi+user32）
- `src/main/modules/core/` — tray / shortcut / storage / ipc / appMenu / logIpc / crashGuard / appUpdater / updaterIpc
- `src/main/config/` — 默认配置与读写
- `src/renderer/src/pages/PanelPage.vue` — 功能面板壳（表头 + 左侧模块 Tab）
- `src/renderer/src/modules/panel/components/WindowTitleBar.vue` — 通栏自定义表头（无自绘窗控）
- `src/renderer/src/pages/ClipboardPage.vue` — 独立剪贴板入口（亦内嵌于面板）
- `src/renderer/src/modules/panel/tabs.ts` — 面板模块注册
- `src/renderer/src/router/index.ts` — `/clipboard` / `/panel` / `/settings`
- `src/renderer/src/utils/logApi.ts` — 渲染日志安装与封装
- `src/shared/logFormat.ts` — 日志安全序列化
- `src/shared/modules/updater.ts` — 更新状态类型
- `src/preload/modules/app.ts`
- `src/preload/modules/log.ts`
- `src/shared/config.ts`
- `src/shared/modules/log.ts`

---

## clipboard

### 功能

- 后台监听系统剪贴板（纯文本、图片）
- 历史记录：去重、置顶、本地持久化、条数上限、过期清理
- 图片以二进制文件存于 `clipboard-images/`（JSON 仅元数据）；删除/清空/裁剪/过期后与收藏合并引用，无引用则同步删文件
- 收藏：独立持久化，与历史解耦；历史删除/清空不影响收藏；取消收藏即删除
- 双入口：快捷键 → 独立浮层仅显示剪贴板（ESC 关闭）；托盘左键 / 程序坞 → 功能面板（已打开则置顶不关闭；右键菜单可切换显隐；原生 titleBarStyle 窗控 + 通栏自定义表头，ESC 不关窗）
- 面板内剪贴板模块：双击 / Enter 粘贴后仍关闭窗口
- 独立浮层粘贴：回填呼出前的前台应用；不改动功能面板窗口层级
- 搜索优先、类型筛选芯片（全部/文本/图片/收藏）、虚拟滚动列表展示
- 打开浮层不自动聚焦搜索；敲击英文/数字时才聚焦并输入；⌘/Ctrl+F 手动聚焦
- ← / → 未聚焦搜索时切换类型筛选；聚焦后为移动光标；↑ / ↓ 切换列表
- 文本超长默认收起 3 行，可展开/收起；列表仅渲染截断预览（完整内容仍可粘贴），避免超大文本拖垮 Layout
- 图片缩略图，hover 预览原图
- 双击 / Enter 粘贴到原光标处；空格多选、Shift 批量粘贴
- 单条删除、一键清空历史（不影响收藏）
- 粘贴后关闭浮层；独立窗可用 ESC / 失焦关闭；功能面板内嵌时 ESC 不关窗
- 设置入口在功能面板左侧轨道底部

### 相关文件

- `src/main/modules/clipboard/` — watcher / history / favorites / paste / imageStore（编排；按键模拟走 focusTarget/mac·win） / ipc
- `src/renderer/src/pages/ClipboardPage.vue` — 剪贴板内容（独立路由与面板内嵌共用）
- `src/renderer/src/modules/clipboard/` — 卡片、虚拟列表、useHistory
- `src/preload/modules/clipboard.ts`
- `src/shared/modules/clipboard.ts`

---

## projects

### 功能

- 功能面板「项目」模块：顶栏固定「首页」+ 已启动项目浏览器式横向页签（含项目图标；多时均分压缩至最小宽度，仍放不下则横向滚动，标题省略）+「+」新开空白标签页（地址栏手动输入网址；加载后同步页面 title / favicon）
- 首页：工作区工具栏（点「工作区」选根目录；可打开 / 重新扫描 / 删除工作区配置）+ 项目卡片网格（图标、可编辑名称、入口/基础路径/端口、启动 Switch；运行中高亮）
- 扫描：一级子目录含 `index.html` / `dist/index.html`；若工作区根自身含入口也识别为项目（id `.`）；解析 favicon / HTML `rel=icon` 为图标
- 可编辑显示名、入口相对路径、固定端口；写入本地配置 `projects.overrides`；保存固定端口前检测占用
- Switch 开：主进程起本地静态 HTTP（可固定端口，缺省随机；SPA 回退）并打开对应页签全屏 `<webview>`；启动时若固定端口被占用则提示错误
- 预览内 `target="_blank"` / `window.open`：不弹系统窗，同项目新开页签（共用静态服务；关至该项目无页签时才停服务）
- 若构建配置了 base，可在编辑里填「基础路径」，预览 URL 挂在此前缀下并按此前缀解析静态资源
- 预览 webview 带浏览器式工具栏：后退 / 前进 / 刷新（加载中可停止；右键弹出强制刷新绕过缓存）、清除此网站数据、可编辑地址栏（Enter 跳转、Esc 还原）、顶部加载指示条
- 预览 webview 使用持久分区 `persist:projects-preview`（HTTP 缓存等落在 `{userData}/Partitions/projects-preview/`）；工具栏「清除此网站数据」按当前页 origin；设置「项目」可整分区清除（不按地址）；均可自选缓存 / Cookie / Local Storage / IndexedDB / Service Worker（先卸掉 webview 再清，避免崩溃）
- 固定端口占用等错误在面板内提示（编辑用右侧 Drawer，操作失败用对话框），不在页面顶栏展示
- 预览 webview 支持右键菜单：刷新 / 强制刷新 / 复制粘贴 / 检查 / 新页签打开链接 / 打开 guest 开发者工具（应用菜单里的 DevTools 只作用于宿主页）；关闭预览页签或销毁 webview 时同步关闭对应开发者工具窗
- Switch 关 / 关页签：停服务；同项目不重复开主服务；切面板模块保留；退出停全部；重启不恢复运行态
- 工作区路径与 overrides 持久化；打开后自动按上次工作区扫描

### 相关文件

- `src/main/modules/projects/` — scan / staticServer / runtime / port / ipc
- `src/renderer/src/modules/projects/components/ProjectWebview.vue` — 预览工具栏（含刷新右键 ContextMenu 强制刷新）
- `src/renderer/src/components/ui/context-menu/` — shadcn ContextMenu（reka-ui）
- `src/renderer/src/components/ui/drawer/` — shadcn Drawer（reka-ui；项目编辑侧栏）
- `src/main/modules/core/webview/` — guest 右键菜单 / 新窗口拦截 / favicon 拉取 / 预览分区数据清除
- `src/renderer/src/modules/settings/components/ProjectSettings.vue` — 设置「项目」清除全部预览数据
- `src/preload/modules/projects.ts`
- `src/shared/modules/projects.ts`
- `src/renderer/src/pages/ProjectsPage.vue`
- `src/renderer/src/modules/projects/` — composables、卡片列表与页签、ProjectWebview、ProjectIcon、ClearPreviewDataDialog
- `src/main/modules/projects/icon.ts` — 扫描时解析项目图标
- `src/renderer/src/modules/panel/tabs.ts` — 面板模块注册
- `src/main/modules/core/windows/panelWindow.ts` — `webviewTag`

---

## screenshot

### 功能

- QQ 式截屏（首版 macOS + Windows）：全局快捷键或托盘右键「截屏」进入
- 进入时按设置决定是否先隐藏本应用窗口（剪贴板浮层 / 功能面板 / 设置窗），默认隐藏；取消或完成后按原显隐恢复
- 所有显示器同时进入截屏：每屏置顶遮罩，画面为进入瞬间的整屏冻结图
- macOS 截屏时临时隐藏菜单栏与程序坞以铺满整屏，退出（Esc/完成/取消）时恢复；Windows 直接全屏 bounds
- 悬停高亮光标下顶层应用窗（点在露出来的区域才命中）；单击锁定该窗口整窗外接矩形（本屏内，含被挡部分）并弹出工具条；按下拖过阈值则区域框选，松手后出工具条
- 点选目标为当前屏上可见的顶层应用窗；选区为整窗裁到本屏的矩形（屏外不计入，不拆成遮挡碎片）
- 选区阶段显示宽×高角标；不做放大镜
- 工具条阶段可选区缩放 / 平移；一旦存在标注则锁死选区（须撤销至无标注或取消重截方可再改选区）；移动/缩放选区后清空撤销与恢复栈
- 工具条默认贴选区下方；贴底不够则改贴上方；上下都不够则收入选区内；最左侧拖拽手柄可挪位
- 工具：选择（点选/框选已有标注并拖移/单选八向缩放；选中后可删除或 Backspace/Delete）、笔、矩形、箭头、马赛克（框选区域打码，粒度 2–10px）；任意工具下移到标注描边附近（约 8px）可直接拖移，矩形仅边框可拖、内部可继续画
- 撤消 / 前进（快照栈，含标注移动与删除）；有限色板 + 粗细 range（笔/矩形/箭头）；马赛克单独粒度 range
- 完成：工具条「完成」/ 双击选区 / Enter → 写入系统剪贴板并直接入库剪贴板历史（同步监听基线防重复）；不弹完成通知
- 截屏结束还焦：与粘贴共用 `focusHandoff`（prepare → hide → activate）；若截屏前已被其它应用盖住，结束后不把功能面板抬到前台
- 下载：截屏遮罩上直接弹系统对话框（PNG、时间戳文件名）；保存成功后结束会话，取消则继续标注；仅保存成功时系统通知
- 取消：Esc / 右键；截屏过程中忽略其它全局快捷键；再按截屏快捷键 = 取消当前截屏
- macOS 无屏幕录制权限：拦截并引导打开系统设置，不进入截屏
- 窗口列表尽力用平台 API；失败则降级为仅框选（可弱提示），不因缺辅助功能整页拦截
- 设置「截屏」分区：可改快捷键（默认 macOS `Cmd+Shift+A`、Windows `Alt+A`，可恢复默认；可清空关闭快捷键）、是否截屏时隐藏本应用
- 自定义协议 `clipimg` / `shotimg` 在 ready 前一次性特权注册；导出用主进程下发冻结帧 base64，避免 canvas 污染

### 相关文件

- `src/main/modules/screenshot/` — 抓屏、多屏遮罩编排、完成/下载、IPC、协议
- `src/main/modules/screenshot/windowHit/` — 窗口枚举与本屏裁剪（mac / win）
- `src/main/modules/core/schemes.ts` — `clipimg` / `shotimg` 特权方案注册
- `src/renderer/src/modules/screenshot/` — 遮罩选区、工具条、标注画布、标注几何（命中/平移）
- `src/renderer/src/modules/screenshot/composables/` — 会话 / 标注 / 绘制 / 工具条 composable
- `src/renderer/src/pages/ScreenshotPage.vue` — 截屏遮罩页（编排 + 指针交互）
- `src/renderer/src/modules/settings/components/ScreenshotSettings.vue` — 截屏设置区块
- `src/preload/modules/screenshot.ts`
- `src/shared/modules/screenshot.ts`
- 完成时耦接：`src/main/modules/clipboard/`（写板 / history / imageStore / syncBaseline）
- 入口耦接：`src/main/modules/core/trayManager.ts`、快捷键注册、`settings.json` 中 `shortcuts` + `screenshot`

---

## settings

### 功能

- 独立设置窗口，左侧按模块 Tab 切换（通用 / 剪贴板 / 截屏 / 项目，可扩展）
- 自定义呼出剪贴板快捷键（可恢复默认；可清空关闭）
- 截屏：快捷键（可恢复默认；可清空关闭）、截屏时是否隐藏本应用窗口
- 项目：清除全部预览浏览数据（整分区，不按地址；可选缓存 / Cookie / Local Storage 等）
- 最大保存条数
- 过期自动清理周期
- 开机自启
- 外观主题：浅色 / 深色 / 跟随系统（柔和石板雾灰 / 抬升炭灰；写入 `general.theme`）
- 退出时清空记录
- 启动时清空记录
- 关于与更新：显示当前版本、检查更新、下载完成后重启安装

### 相关文件

- `src/renderer/src/pages/SettingsPage.vue`
- `src/renderer/src/modules/settings/tabs.ts` — 模块 Tab 注册
- `src/renderer/src/modules/settings/components/` — GeneralSettings / ClipboardSettings / ScreenshotSettings / ProjectSettings / HotkeyInput
- `src/renderer/src/composables/useTheme.ts` — 渲染进程应用 `.dark`
- `src/main/modules/core/theme.ts` — 主进程 nativeTheme 同步
- `src/main/modules/core/windows/settingsWindow.ts`
- `src/main/modules/core/appUpdater.ts` / `updaterIpc.ts`
- `src/shared/config.ts` — `DEFAULT_TOGGLE_PANEL_SHORTCUT`、截屏默认快捷键、`general.theme`
- `src/shared/modules/updater.ts`
- `src/shared/modules/screenshot.ts` — 截屏配置类型

---

## 本地持久化文件

应用主动写入的本地文件（均在主进程）。路径基于 Electron 标准目录：`userData`、`logs`、`crashDumps`（具体绝对路径因平台/安装方式而异）。

### 应用数据（`userData`）

| 文件 | 功能 |
|------|------|
| `settings.json` | 应用配置：窗口、快捷键（含截屏）、截屏选项、剪贴板上限/清理、项目工作区与 overrides、隐私、开机自启、界面主题（浅/深/跟随系统）等 |
| `clipboard-history.json` | 剪贴板历史记录（文本 / 图片元数据） |
| `clipboard-favorites.json` | 剪贴板收藏（与历史独立；删历史不影响收藏） |
| `clipboard-images/` | 剪贴板图片二进制（按内容 hash 命名；无引用时删除） |

写入方式：原子写（先 `.tmp` 再 rename）。项目相关配置也落在 `settings.json` 的 `projects` 字段，无单独项目文件。

### 诊断与崩溃（`logs` / `crashDumps`）

| 文件 | 功能 |
|------|------|
| `diag.log` | 诊断日志（未捕获异常、渲染/子进程崩溃、启停、更新过程）；单行截断；写时与启动均按上限轮转为 `diag.log.old`；断管噪音本会话只记一次 |
| `diag-session.json` | 会话心跳；下次启动据此判断上次是否非正常退出 |
| `crashDumps/` | Electron crashReporter 本地 minidump（不上传） |

### 其它由运行时写入（非业务 JSON）

| 路径 | 功能 |
|------|------|
| `userData` 下更新缓存目录 | `electron-updater` 下载的待安装包（仅打包后自动更新） |
| `userData/Partitions/projects-preview/` | 项目预览 `<webview>` 的 Chromium 分区数据（cookie / localStorage 等） |

### 相关文件

- `src/main/config/index.ts` — `settings.json`
- `src/main/modules/core/storage.ts` — 通用 JSON 原子写入
- `src/main/modules/clipboard/history.ts` — `clipboard-history.json`
- `src/main/modules/clipboard/favorites.ts` — `clipboard-favorites.json`
- `src/main/modules/clipboard/imageStore.ts` — `clipboard-images/` + `clipimg://` 协议
- `src/main/modules/core/crashGuard.ts` — `diag.log` / `diag-session.json` / crashReporter
- `src/main/modules/core/appUpdater.ts` — 更新下载（经 electron-updater）
- `src/renderer/src/modules/projects/components/ProjectWebview.vue` — `persist:projects-preview`
