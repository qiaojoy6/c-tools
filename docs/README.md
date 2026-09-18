# c-tools 功能文档

按模块记录已有功能与对应源码目录。新增功能时，在对应模块补功能条目；有新文件则补到「相关文件」。

架构演进（可插拔 Feature / 插件系统）：见 [plugin-system.md](./plugin-system.md)。

---

## feature（插件宿主 · P0）

### 功能

- 主进程 `defineFeature` + `FeatureHost`：编译期注册内置模块，统一 setup / registerIpc / bindShortcuts / dispose
- 渲染层 Panel / Settings 贡献表带 `component`，页面按注册表动态挂载（去掉硬编码 v-if 链）
- 已迁入 FeatureHost：`clipboard`、`projects`、`quickFolders`、`screenshot`、`recorder`、`hosts`（主进程业务模块均经 Host）
- 跨模块互斥 / 服务经 `FeatureContext.shared`；快捷键 `bindShortcuts`；托盘 `bindTray`
- `features.enabled`：配置关闭模块后 Host 跳过 setup；Panel/Settings 隐藏对应 Tab；运行时软切换快捷键/托盘/剪贴板监听；启动未加载的模块可热 setup
- preload 经 `PRELOAD_BRIDGES` 注册表组装 `window.api`
- 第三方动态加载与 capability 沙箱见计划 P2，尚未实现

### 相关文件

- `docs/plugin-system.md` — 架构计划与分阶段
- `src/shared/modules/feature.ts` — FeatureId / FeaturesConfig / 贡献点元类型
- `src/main/modules/feature/` — FeatureHost / defineFeature / FeatureShared
- `src/main/modules/clipboard/feature.ts` — clipboard Feature
- `src/main/modules/clipboard/hostServices.ts` — 截屏入库等对外服务
- `src/main/modules/projects/feature.ts` — projects Feature
- `src/main/modules/quickFolders/feature.ts` — quickFolders Feature
- `src/main/modules/screenshot/feature.ts` — screenshot Feature（含 tray）
- `src/main/modules/recorder/feature.ts` — recorder Feature（含 tray）
- `src/main/modules/hosts/feature.ts` — hosts Feature
- `src/renderer/src/modules/feature/enabled.ts` — 渲染层按 enabled 过滤
- `src/renderer/src/modules/panel/tabs.ts` — 面板贡献（含 component / keepAlive）
- `src/renderer/src/modules/settings/tabs.ts` — 设置贡献（含 component）

---

## core

### 功能

- 独立剪贴板窗口（`/clipboard`）：无边框置顶浮层、每次呼出跟鼠标所在屏顶部居中、ESC 关闭浮层且不还焦外部（面板开着则回焦面板，留在当前桌面）；粘贴仍还焦呼出前应用；仅快捷键呼出；失焦隐藏由 `window.hideOnBlur` 控制（View 菜单可开关）；macOS 用 `showInactive`（不用 `type:panel`，避免 styleMask 0x80 刷屏）且不调 `app.focus`，不抬起功能面板；macOS 置顶用 `floating` 级，避免盖住输入法候选窗
- 呼出位置：剪贴板 / 快捷文件夹 / 功能面板（隐藏后再开）跟随鼠标所在显示器；macOS 同时迁到当前桌面（Spaces），不切回创建所在主桌面（`presentNearCursor`）
- 功能面板窗口（`/panel`）：`titleBarStyle: hidden` + 原生窗控（macOS 交通灯 / Win·Linux `titleBarOverlay`），通栏自定义表头；托盘左键始终显示/置顶、右键可切换显隐；程序坞 / Cmd+Tab 切回置顶（不关闭、不 steal 抢焦）；ESC / 失焦不关闭；已打开时不因再次呼出改位置
- macOS 程序坞图标：默认 `accessory`（不进程序坞）；唤起功能面板后 `regular`；最小化仍留在程序坞；面板 hide 后回 accessory；截屏/框选期间经 `AppUiConceal` 冻结 Dock 显隐；activationPolicy 仅在状态变化时写入，避免重复 dock.show 搅乱 Dock 标签
- 本应用窗口隐身策略 `AppUiConceal`：`none`（录制不碰窗）/ `dim-panel-if-visible`（截屏开启隐藏且面板开着 → 透明度 0，结束恢复；面板没开则 noop）；其它功能日后直接复用 begin/end
- 面板左侧使用 shadcn-vue Sidebar（`collapsible="icon"`）切换模块（剪贴板、快捷文件夹、项目）；底部设置
- 侧栏随面板内宽自动展开/收起，也可手动切换（SidebarTrigger / ⌘B）；纯渲染层适配，不改主进程窗宽
- 独立设置窗口
- 应用菜单保留 Edit（系统复制/粘贴依赖）与 View；无 File / Window；View 可开关「点击空白区域隐藏窗口」（作用于独立剪贴板浮层）；刷新 / DevTools 仅开发环境（未打包）提供
- 托盘常驻（关窗口不退出）；右键菜单含「截屏 / 区域录屏 / 全屏录屏」等入口；已配置的全局快捷键会显示在对应菜单项旁
- 配置本地持久化
- 开机自启（设置与托盘共用配置；变更后同步系统登录项，并推送 `config:updated` 刷新设置窗）
- 单实例（二次启动唤起功能面板；程序坞 / Cmd+Tab 切回立刻置顶且不异步采焦、不 steal）
- 粘贴：先写入系统剪贴板，再关窗并模拟粘贴；自动粘贴失败时提示手动 Ctrl+V / ⌘V（不再因焦点失败而跳过写入）
- 独立剪贴板回填：贴到呼出前的前台应用；浮层不改动功能面板显隐与层级
- macOS 无辅助功能权限时：只写入系统剪贴板，不模拟回填、不拉起系统设置；每次启动提示一次，粘贴过程不再重复弹通知
- 自动粘贴失败时的「已复制，请手动 ⌘V/Ctrl+V」每个进程只提示一次
- Windows 粘贴：统一模拟 Ctrl+V（SendInput / keybd_event，经 `focus-paste` 原生模块；不用 WM_PASTE）；原生不可用时回退 PowerShell SendKeys
- 焦点交接 / 模拟粘贴：`native-rs/focus-paste-core` + `focus-paste-napi`（Win user32 / mac osascript）；TS `focusTarget` 仅薄封装与延时编排
- Windows 焦点：快捷键瞬间同步采 hwnd（剪贴板 / 快捷文件夹）；粘贴 hide 时 `setFocusable(false)` 强制还焦；hide 前 `AllowSetForegroundWindow`；激活后只要前台不在本进程即模拟粘贴（不过严要求原 hwnd）；粘贴与 macOS 共用 `restorePreviousFocus`；ESC 走 `dismissFloatingStayInApp`（先回焦面板再 `yieldFocus:false` 隐藏，避免 Win 虚拟桌面被上一窗拽走）
- 渲染进程日志 `window.logApi` / `import { logApi }`：debug/info/warn/error；先安全序列化再经 `api.logWrite` 打到主进程终端；DevTools 仍打印原始对象
- 主进程意外退出兜底：`logs/diag.log`（未捕获异常、渲染/子进程崩溃、启停）；正常时同步 mirror 到终端；会话心跳检测上次非正常退出；本地 crashReporter minidump（不上传）；终端断管（EIO/EPIPE）只落盘一次、不刷爆日志
- 自动更新：打包后启动自动检查（源为 GitHub Releases / `qiaojoy6/c-tools`）；macOS 因未签名改为提示并引导到 GitHub Releases 手动下载；其它平台静默下载，设置页可重启安装

### 相关文件

- `src/main/modules/core/windows/` — ClipboardWindow / QuickFoldersWindow / PanelWindow / SettingsWindow / WindowManager / floatingLevel（浮层置顶层级）/ presentNearCursor（呼出跟鼠标屏 + 当前 Space）/ focusHandoff（粘贴与截屏共用还焦）/ macDockIcon（程序坞随面板）/ appUiConceal（截屏·录制等窗口隐身策略）
- `src/main/modules/core/windows/focusTarget/` — 前台采焦 / 激活 / 模拟粘贴（`index` 分发；`mac`/`win` 调 focus-paste-napi；`native.ts` 加载 `.node`）
- `native-rs/focus-paste-core/` — 焦点交接与模拟粘贴内核（按 win/mac 模块划分）
- `native-rs/focus-paste-napi/` — napi 胶水与 `.node` 构建
- `src/main/modules/core/` — tray / shortcut / storage / ipc / appMenu / logIpc / crashGuard / appUpdater / updaterIpc
- `src/main/bootstrap/` — 主进程启动编排（FeatureHost + shortcuts / tray / ipc / lifecycle）
- `src/main/modules/feature/` — 内置 Feature 宿主（见「feature」节）
- `src/main/index.ts` — 薄入口：单实例、协议、ready、生命周期
- `src/main/config/` — 默认配置与读写
- `src/renderer/src/pages/PanelPage.vue` — 功能面板壳（表头 + shadcn Sidebar；模块页来自 `panel/tabs`）
- `src/renderer/src/components/ui/sidebar/` — shadcn-vue Sidebar（嵌入面板布局）
- `src/renderer/src/modules/panel/components/WindowTitleBar.vue` — 通栏自定义表头（无自绘窗控）
- `src/renderer/src/pages/ClipboardPage.vue` — 独立剪贴板入口（亦内嵌于面板）
- `src/renderer/src/modules/panel/tabs.ts` — 面板模块注册（含页面 component）
- `src/renderer/src/router/index.ts` — `/clipboard` / `/quick-folders` / `/panel` / `/settings`
- `src/renderer/src/utils/logApi.ts` — 渲染日志安装与封装
- `src/shared/logFormat.ts` — 日志安全序列化
- `src/shared/modules/updater.ts` — 更新状态类型
- `src/preload/feature/` — bridge 注册表（defineRootBridge / defineNestedBridge / assemblePreloadApi）
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
- ESC 关浮层：不还焦外部应用（mac 不切 Space / Win 不切虚拟桌面）；面板开着则回焦面板；粘贴仍还焦呼出前应用
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

- `src/main/modules/clipboard/` — assemble / feature / hostServices / watcher / history / favorites / paste / imageStore / ipc / broadcast
- `src/renderer/src/pages/ClipboardPage.vue` — 剪贴板内容（独立路由与面板内嵌共用）
- `src/renderer/src/components/SearchField.vue` — 浮层搜索框（剪贴板 / 快捷文件夹共用）
- `src/renderer/src/components/ListFooter.vue` — 浮层底栏条数 / 快捷键提示（剪贴板 / 快捷文件夹共用）
- `src/renderer/src/components/ToastMessage.vue` — 顶部轻提示（剪贴板 / 快捷文件夹 / 设置共用）
- `src/renderer/src/composables/useToast.ts` — 轻提示定时与卸载清理
- `src/renderer/src/modules/clipboard/` — 卡片、虚拟列表、useHistory
- `src/preload/modules/clipboard.ts`
- `src/shared/modules/clipboard.ts`
- 入口耦接：`FeatureHost` / `bindShortcuts`（toggleClipboard）/ `WindowManager` / `panel/tabs` / `settings/tabs`

---

## quickFolders

### 功能

- 快捷文件夹书签：本地持久化路径 + 可选备注；路径唯一；默认上限 50（设置可改）
- 双入口：全局快捷键 → 独立浮层（行为对齐剪贴板，含 macOS `floating` 置顶以免盖输入法候选；ESC 关浮层不还焦外部、不抬功能面板）；功能面板左侧 Tab 内嵌同一页面
- 添加：页面内系统选目录、粘贴/手输路径，或将文件夹拖入添加/编辑弹窗的路径框；添加时路径必须是已存在的文件夹；重复路径拒绝
- 列表：有备注显示备注，无备注显示文件夹名，其后跟路径；搜索扫备注/文件夹名/路径
- 打开：Enter / 双击 → `shell.openPath`；独立浮层打开后立刻关闭并保持 Finder/资源管理器在前（不抬功能面板）
- 编辑：有效项可改备注与路径；失效路径灰显「路径无效」，仅可删除（删除前二次确认）
- 排序：默认新添加在上；支持拖拽改序并持久化（搜索中禁用拖拽）
- 设置：呼出快捷键（默认 mac `⌘⇧O` / win `Ctrl+⇧O`，可清空）、条数上限
- 不做：系统访达/资源管理器右键扩展；首版仅文件夹

### 相关文件

- `src/main/modules/quickFolders/` — store / ipc / feature（FeatureHost：lifecycle + IPC + 快捷键）
- `src/main/modules/core/windows/quickFoldersWindow.ts` — 独立浮层
- `src/renderer/src/pages/QuickFoldersPage.vue` — 列表与添加/编辑（独立路由与面板内嵌共用）
- `src/renderer/src/components/SearchField.vue` — 浮层搜索框（与剪贴板共用）
- `src/renderer/src/components/ListFooter.vue` — 浮层底栏（与剪贴板共用）
- `src/renderer/src/components/ToastMessage.vue` / `composables/useToast.ts` — 顶部轻提示（与剪贴板 / 设置共用）
- `src/renderer/src/modules/quickFolders/composables/useQuickFolders.ts`
- `src/renderer/src/modules/quickFolders/components/` — Toolbar / List / Row / FormDialog / DeleteDialog
- `src/renderer/src/modules/quickFolders/label.ts` — 展示名（备注或文件夹名）
- `src/renderer/src/modules/settings/components/QuickFoldersSettings.vue`
- `src/preload/modules/quickFolders.ts`
- `src/shared/modules/quickFolders.ts`
- 入口耦接：`FeatureHost` / `shortcutManager`（经 `bindShortcuts`）/ `WindowManager` / `panel/tabs` / `settings/tabs`

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

- `src/main/modules/projects/` — scan / staticServer / runtime / port / ipc / feature（FeatureHost 样板）
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
- `src/renderer/src/modules/panel/tabs.ts` — 面板模块注册（projects keepAlive）
- `src/main/modules/core/windows/panelWindow.ts` — `webviewTag`

---

## screenshot

### 功能

- QQ 式截屏（首版 macOS + Windows）：全局快捷键或托盘右键「截屏」进入
- 截屏完成还原：勾选「隐藏本应用窗口」且面板开着时，仅把面板透明度设为 0，结束恢复（不 hide，Dock 保持显示）；面板未开则不动任何窗口；未勾选也不动窗口；结束时还焦外部前台（若有）
- 进入时按上述策略隐身（剪贴板 / 快捷文件夹浮层不参与，仍靠失焦隐藏）；截屏期间冻结程序坞为进入瞬间状态
- 所有显示器同时进入截屏：每屏置顶遮罩，画面为进入瞬间的整屏冻结图
- macOS 截屏遮罩：不透明黑底冻屏 + `screen-saver` 置顶；露出前仅 HideMenuBar；不用 `type:panel` / HideDock / `setVisibleOnAllWorkspaces`；全尺寸预热减轻首次闪屏
- 悬停高亮光标下顶层应用窗（点在露出来的区域才命中）；单击锁定该窗口整窗外接矩形（本屏内，含被挡部分）并弹出工具条；按下拖过阈值则区域框选，松手后出工具条
- 点选目标为当前屏上可见的顶层应用窗；选区为整窗裁到本屏的矩形（屏外不计入，不拆成遮挡碎片）
- 选区阶段显示宽×高角标；不做放大镜
- 工具条阶段可选区缩放 / 平移；一旦存在标注则锁死选区（须撤销至无标注或取消重截方可再改选区）；移动/缩放选区后清空撤销与恢复栈
- 工具条默认贴选区下方；贴底不够则改贴上方；上下都不够则收入选区内；最左侧拖拽手柄可挪位
- 工具：选择（点选/框选已有标注并拖移/单选八向缩放；选中后可删除或 Backspace/Delete）、笔、矩形、箭头、马赛克（框选区域打码，粒度 2–10px）；任意工具下移到标注描边附近（约 8px）可直接拖移，矩形仅边框可拖、内部可继续画
- 撤消 / 前进（快照栈，含标注移动与删除）；有限色板 + 粗细 range（笔/矩形/箭头）；马赛克单独粒度 range
- 完成：工具条「完成」/ 双击选区 / Enter → 写入系统剪贴板并直接入库剪贴板历史（同步监听基线防重复）；不弹完成通知
- 截屏结束：还原面板透明度（若曾 dim）；有外部目标则还焦；未开面板则界面保持原样且程序坞不出现
- 下载：截屏遮罩上直接弹系统对话框（PNG、时间戳文件名）；保存成功后结束会话，取消则继续标注；仅保存成功时系统通知
- 取消：Esc / 右键；截屏过程中忽略其它全局快捷键；再按截屏快捷键 = 取消当前截屏
- macOS 无屏幕录制权限：拦截并引导打开系统设置，不进入截屏
- 窗口列表尽力用平台 API；失败则降级为仅框选（可弱提示），不因缺辅助功能整页拦截
- 设置「截屏」分区：可改快捷键（默认 macOS `Cmd+Shift+A`、Windows `Alt+A`，可恢复默认；可清空关闭快捷键）、是否截屏时隐藏本应用
- 自定义协议 `clipimg` / `shotimg` 在 ready 前一次性特权注册；导出用主进程下发冻结帧 base64，避免 canvas 污染

### 相关文件

- `src/main/modules/screenshot/` — feature / 抓屏、多屏遮罩编排、完成/下载、IPC、协议
- `src/main/modules/screenshot/windowHit/` — 窗口枚举与本屏裁剪（mac / win）
- `src/main/modules/core/schemes.ts` — `clipimg` / `shotimg` 特权方案注册
- `src/renderer/src/modules/screenshot/` — 遮罩选区、工具条、标注画布、标注几何（命中/平移）
- `src/renderer/src/modules/screenshot/composables/` — 会话 / 标注 / 绘制 / 工具条 composable
- `src/renderer/src/pages/ScreenshotPage.vue` — 截屏遮罩页（编排 + 指针交互）
- `src/renderer/src/modules/settings/components/ScreenshotSettings.vue` — 截屏设置区块
- `src/preload/modules/screenshot.ts`
- `src/shared/modules/screenshot.ts`
- 完成时耦接：`ClipboardHostServices.ingestScreenshotPng`（写板 / 同步基线 / 入库历史）
- 入口耦接：`FeatureHost` / `bindShortcuts` / tray、`settings.json` 中 `shortcuts` + `screenshot`

---

## recorder

### 功能

- Rust 录屏内核（`native-rs/recorder-core`）：macOS 优先 **ScreenCaptureKit** 同源采集画面+系统声（`sck_capture.rs`，MIT `screencapturekit`）；画面静止（无脏帧/Idle）时仍按目标 fps 推进视频时间轴与 UI 计时，避免成片短于系统声/麦；失败回退 xcap + flexaudio Process Tap；Windows 为 xcap + WASAPI（事件驱动）+ `CaptureClock` 首帧锚定音画；flexaudio 采集麦克风；录制中可实时开关麦/系统声；写入侧补静音 + 停录片头裁切/CFR 时长对齐；ffmpeg sidecar 编码/混流 MP4；视频清晰度三档（流畅 / 超清 / 原画）
- napi-rs 插件（`native-rs/recorder-napi`、`native-rs/focus-paste-napi`）：编译为平台 `.node`，由 Electron 主进程同进程加载（复用 macOS TCC）
- 主进程封装：枚举显示器/麦克风/系统输出、开始/暂停/继续/停止录制、录制中 `setMicEnabled` / `setSystemAudioEnabled`、状态与事件推送；`start` 可传 `region`（相对显示器物理像素）与 `quality`；默认先写到 `userData/recordings/`，停止后弹系统「另存为」可自定义路径（取消则删除成片不保存）
- 框选遮罩：托盘或全局快捷键「区域录屏」进入多屏透明框选；不隐藏本应用窗口（按当前桌面所见录制）；悬停高亮应用窗、单击锁定窗尺寸（与截屏同源窗口枚举），或拖拽框选；工具条可切换系统声/麦克风、选择麦克风设备（列表来自 Rust `listMics`）与清晰度（流畅 / 超清 / 原画，固定 MP4，写入 `settings.json` 持久化）；无麦克风/系统声权限时不可选开（点击后关框选并直接跳转系统设置）；确认后关遮罩开录；Esc / 右键 /「退出录制」/ 再按区域快捷键取消
- 全屏录屏：托盘或全局快捷键「全屏录屏」弹出选屏 Dialog（屏幕列表由 Rust 内核 `listScreens` 提供）；同样不藏本应用窗；可切换系统声/麦克风、选择麦克风设备与清晰度（与区域共用持久化配置）；无对应权限时不可选开；确认后整屏开录（不传 `region`）
- 快捷键：设置中可配置区域 / 全屏 / 暂停·继续 / 停止录屏全局快捷键（可恢复默认、清空关闭）；录制中或截屏进行中忽略启动类快捷键；暂停·停止仅录制中生效；托盘入口仍可用
- 全屏录制中：悬浮条（默认 REC/暂停标识 + 计时；移入后同尺寸交叉淡化为标识 + 系统声/麦克风（按钮底色随说话音量起伏）/暂停/停止；可自由拖放，位置写入 `settings.json` 下次全屏录制复用）；托盘 / 快捷键「停止」同样弹保存路径；托盘菜单仍可暂停·继续 / 停止
- 区域录制中：选区外侧显示点击穿透的蓝色范围框；录制控制统一用悬浮条（与全屏相同 UI；落点优先选区下/上，不够则左/右，再不行用全屏记住的位置；可拖放；悬停可开关系统声/麦克风、暂停·停止；尽量 `setContentProtection`）；停止后弹自定义保存路径；结束后自动收起
- 渲染进程通过 `window.api.recorder` 控制（含 `setMicEnabled` / `setSystemAudioEnabled`）；录制悬浮条已接通实时音源开关与麦克风音量底色；托盘右键可「区域录屏 / 全屏录屏 / 暂停·继续 / 停止录屏」（录制中菜单旁显示对应快捷键）
- 系统声：macOS 14.4+ CoreAudio Process Tap（需「系统设置 → 隐私与安全性」中允许音频/系统音频录制）；失败时自动回退到本机虚拟声卡输入（BlackHole / OrayVirtual 等）；麦克风与系统声分轨采集后混音；Windows 为 WASAPI loopback
- 麦+系统声同时开：停录混音前对麦轨做简易 AEC（以系统声为参考消外放漏音；耳机等无明显漏音时自动跳过）；麦克风列表排除虚拟环回设备
- 打包内置 ffmpeg sidecar（`ffmpeg-static` → `Resources/bin`）；开发态优先用同包二进制，否则回退 PATH；终端用户无需本机安装 ffmpeg

### 相关文件

- `native-rs/recorder-core/` — 纯 Rust 录屏内核（含 `aec.rs`、`av_sync.rs`、`capture_clock.rs`、macOS `sck_capture.rs`）
- `native-rs/recorder-napi/` — 录屏 napi 胶水与 `.node` 构建
- `native-rs/focus-paste-core/` — 焦点交接 / 模拟粘贴内核（win / mac 分模块）
- `native-rs/focus-paste-napi/` — 焦点粘贴 napi 胶水
- `native/` — 编译产物 `.node`（开发与打包资源）
- `electron-builder.yml` — `extraResources` 拷贝 `native/*.node` 与 `ffmpeg-static` 可执行文件到 `bin/`
- `scripts/build-native.sh` — 编译 recorder + focus-paste 并拷贝到 `native/`
- `.github/workflows/build.yml` — GitHub Actions：手动 Run 可打 mac 包（Artifact）；`v*` tag 时发布到 GitHub Release
- `electron-builder.yml` / `dev-app-update.yml` — 更新源 `provider: github`
- `src/main/modules/recorder/` — feature / 主进程加载插件、框选遮罩会话、全屏选屏弹窗、区域外框与全屏悬浮条 IPC、停录另存为、麦/系统声权限（`permission.ts`）
- `src/main/modules/recorder/saveRecording.ts` — 停录后系统保存对话框与挪文件
- `src/main/modules/core/trayManager.ts` — 托盘；录制中暂停/停止入口
- `src/main/modules/core/shortcutManager.ts` — 全局快捷键（含区域/全屏/暂停·停止录屏）
- `src/renderer/src/pages/RecorderSelectPage.vue` — 录屏框选遮罩页
- `src/renderer/src/pages/RecorderFullscreenPage.vue` — 全屏录屏选屏 Dialog
- `src/renderer/src/modules/recorder/composables/useRecorderPrefs.ts` — 麦/系统声/麦设备/清晰度读写 `settings.json`
- `src/renderer/src/modules/recorder/components/RecorderOptionsBar.vue` — 录制选项条（系统声/麦克风开关与设备选择/清晰度；区域与全屏共用）
- `src/renderer/src/modules/settings/components/RecorderSettings.vue` — 录屏快捷键设置
- `src/renderer/recorder-border.html` — 区域录制选区外框（仅描边）
- `src/renderer/recorder-float.html` — 录制悬浮条（区域/全屏共用；固定尺寸；标识常驻；计时与系统声/麦克风音量底色/暂停/停止交叉淡化；自由拖放）
- `src/preload/modules/recorder.ts`
- `src/shared/modules/recorder.ts` — 录屏类型
- `src/shared/shortcuts.ts` — 区域/全屏/暂停·停止默认快捷键
- 入口耦接：`FeatureHost` / `bindShortcuts` / tray
- 路由：`src/renderer/src/router/index.ts`（`/recorder-select` / `/recorder-fullscreen`）

---

## hosts

### 功能

- 功能面板「Hosts」：多方案 Tab（添加时填名称并立刻写入本地 `hosts-schemes.json`，开关默认关）
- 首位固定「系统 hosts」只读预览（读系统 hosts 原文，不可拖拽 / 不可改）；写入系统后可刷新；其余方案可拖拽排序
- 每方案：展示名可改（系统标记只认稳定 id）、CodeMirror 编辑（hosts 语法高亮；不做格式校验）、拖拽排序（顺序即叠加优先级）
- 开开关 → 按需提权写入系统 hosts 中该 id 标记段；关开关 → 提权删除该段；开启中禁止删除
- 提权：首次系统授权时写入 hosts 并拉起短时 helper（macOS 用 python 脱离进程树，避免假死；Windows 为 UAC helper）；之后约 10 分钟内滑动续期免密；面板展示下次需授权时间；不收集、不存储用户密码；退出应用结束会话
- 开启态下编辑区失焦 → 写本地并更新系统该段；有开启方案时拖拽排序 → 立刻提权按新顺序重写全部 c-tools 段
- 系统文件采用 `# ===== c-tools:<id> =====` / `# ===== /c-tools:<id> =====` 围栏，块外内容不动；多方案可同时开启并叠加；写成功后自动 flush DNS（macOS / Windows）
- 设置「Hosts」：从系统移除全部 c-tools 段（并关闭本地方案开关）；关功能模块只藏 UI，不自动改系统
- 仅支持 macOS 与 Windows

### 相关文件

- `src/main/modules/hosts/` — feature / store / markers / elevateSession / elevateHelperScripts / elevateWrite / systemHosts / ipc（含 `hosts:readSystem`）
- `src/shared/modules/hosts.ts` — 方案类型
- `src/preload/modules/hosts.ts`
- `src/renderer/src/pages/HostsPage.vue`
- `src/renderer/src/modules/hosts/` — composables / CodeMirror 编辑器 / 方案行 / 名称对话框
- `src/renderer/src/modules/hosts/codemirror/` — hosts 语言高亮与主题
- `src/renderer/src/modules/settings/components/HostsSettings.vue`
- 入口耦接：`FeatureHost` / `panel/tabs` / `settings/tabs` / `features.enabled`

---

## settings

### 功能

- 独立设置窗口，左侧按模块 Tab 切换（通用 / 剪贴板 / 快捷文件夹 / 截屏 / 录屏 / 项目 / Hosts，可扩展）
- 自定义呼出剪贴板快捷键（可恢复默认；可清空关闭）
- 快捷文件夹：呼出快捷键（可恢复默认；可清空关闭）、最大保存条数
- 截屏：快捷键（可恢复默认；可清空关闭）、截屏时是否隐藏本应用窗口
- 录屏：区域 / 全屏 / 暂停·继续 / 停止录屏全局快捷键（可恢复默认；可清空关闭）
- 项目：清除全部预览浏览数据（整分区，不按地址；可选缓存 / Cookie / Local Storage 等）
- 最大保存条数
- 过期自动清理周期
- 开机自启
- 外观主题：浅色 / 深色 / 跟随系统（柔和石板雾灰 / 抬升炭灰；写入 `general.theme`）
- 功能模块开关（通用页）：剪贴板 / 快捷文件夹 / 项目 / 截屏 / 录屏 / Hosts；写入 `features.enabled`；关闭后侧栏 / 快捷键 / 托盘立刻失效，剪贴板监听暂停；启动时未加载的模块首次开启会热加载（截屏/录屏会预热遮罩）；关剪贴板会连带关截屏；关 Hosts 只藏 UI，不自动清系统 hosts 段
- 退出时清空记录
- 启动时清空记录
- 关于与更新：显示当前版本、检查更新；macOS 有新版本时提示并「前往 GitHub 下载」；其它平台下载完成后可重启安装

### 相关文件

- `src/renderer/src/pages/SettingsPage.vue` — 设置壳；内容来自 `settings/tabs` 动态挂载
- `src/renderer/src/modules/settings/tabs.ts` — 模块 Tab 注册（含 settings component）
- `src/renderer/src/modules/settings/components/` — GeneralSettings（含功能模块开关）/ ClipboardSettings / QuickFoldersSettings / ScreenshotSettings / RecorderSettings / ProjectSettings / HostsSettings / HotkeyInput
- `src/renderer/src/modules/feature/toggles.ts` — 功能开关选项文案
- `src/renderer/src/modules/feature/enabled.ts` — 按 `features.enabled` 过滤 Tab

- `src/main/modules/core/theme.ts` — 主进程 nativeTheme 同步
- `src/main/modules/core/windows/settingsWindow.ts`
- `src/main/modules/core/appUpdater.ts` / `updaterIpc.ts`
- `src/shared/config.ts` — `AppConfig` / `general.theme` 等
- `src/shared/shortcuts.ts` — 全局快捷键类型与各平台默认值（`DEFAULT_SHORTCUTS`）
- `src/shared/modules/updater.ts`
- `src/shared/modules/screenshot.ts` — 截屏配置类型
- `src/shared/modules/recorder.ts` — 录屏配置类型
---

## 本地持久化文件

应用主动写入的本地文件（均在主进程）。路径基于 Electron 标准目录：`userData`、`logs`、`crashDumps`（具体绝对路径因平台/安装方式而异）。

### 应用数据（`userData`）

| 文件 | 功能 |
|------|------|
| `settings.json` | 应用配置：窗口、快捷键（含截屏、录屏、快捷文件夹）、截屏选项、剪贴板上限/清理、快捷文件夹条数上限、项目工作区与 overrides、隐私、开机自启、界面主题（浅/深/跟随系统）、录屏（全屏悬浮条位置、麦/系统声开关、清晰度）等 |
| `clipboard-history.json` | 剪贴板历史记录（文本 / 图片元数据） |
| `clipboard-favorites.json` | 剪贴板收藏（与历史独立；删历史不影响收藏） |
| `clipboard-images/` | 剪贴板图片二进制（按内容 hash 命名；无引用时删除） |
| `quick-folders.json` | 快捷文件夹书签（路径、备注、顺序） |
| `hosts-schemes.json` | Hosts 多方案（id / 名称 / 顺序 / enabled / content） |

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
- `src/main/modules/quickFolders/store.ts` — `quick-folders.json`
- `src/main/modules/hosts/store.ts` — `hosts-schemes.json`
- `src/main/modules/core/crashGuard.ts` — `diag.log` / `diag-session.json` / crashReporter
- `src/main/modules/core/appUpdater.ts` — 更新下载（经 electron-updater）
- `src/renderer/src/modules/projects/components/ProjectWebview.vue` — `persist:projects-preview`
