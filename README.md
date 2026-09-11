# c-tools

c-tools 是一款基于 Electron + Vue 的桌面效率工具，目前以剪贴板管理为核心。

它会在后台监听系统剪贴板（文本、图片），保存历史并支持收藏；可通过快捷键呼出独立浮层，或从托盘打开功能面板，搜索、筛选后粘贴回原应用。另有设置（快捷键、条数上限、过期清理、开机自启等），托盘常驻，关窗不退出。录屏能力由 Rust 原生插件（napi `.node`）提供。

## icon

| mac       | 尺寸(实际的内容大小占原图的80.5%左右) | 说明            |
| --------- | ---------------------- | ------------- |
| icon.icns | 512、256、128、64、32      | 包含程序坞、文件列表中的、 |


## 新电脑：从零编译与打包

在一台装好 Node 的新机器上，克隆本仓库后按下面做即可开发和打包。

### 1. 环境依赖

| 依赖 | 用途 | 说明 |
|------|------|------|
| **Node.js** | 前端 / Electron | 建议 **18+**（推荐 LTS），已装则可跳过 |
| **npm** | 包管理 | 随 Node 安装 |
| **Rust** | 编译录屏 `.node` | [rustup](https://rustup.rs/) 安装；仓库含 `rust-toolchain.toml`，进入项目后会自动对齐工具链 |
| **ffmpeg** | 录屏编码 / 混流 | 由依赖 `ffmpeg-static` 提供；`npm install` 后即可。打包会把可执行文件打进安装包，用户机不必再装 |

可选但推荐：

- **macOS**：Xcode Command Line Tools（`xcode-select --install`）
- **Windows**：Visual Studio Build Tools（MSVC，编 Windows `.node` / Electron 原生依赖时需要）

校验：

```bash
node -v
npm -v
rustc --version
cargo --version
# 可选：确认 ffmpeg-static 已下载
node -e "console.log(require('ffmpeg-static'))"
```

### 2. 克隆与安装

```bash
git clone <本仓库地址>
cd c-tools
npm install
```

`postinstall` 会执行 `electron-builder install-app-deps`，并尝试给开发态 Electron 写入 macOS 麦克风/系统音频权限文案（`scripts/patch-electron-plist.sh`）。

### 3. 编译录屏原生插件（必做一次）

`.node` **不进 Git**，新机器必须本地编：

```bash
npm run build:native
```

脚本会：

1. 在 `native-rs/recorder-napi` 用 napi-rs 编译**当前平台**的 `.node`
2. 拷贝到项目根目录 `native/`（开发加载与打包 `extraResources` 都用这里）

产物示例：

- Apple Silicon Mac → `native/recorder.darwin-arm64.node`
- Intel Mac → `native/recorder.darwin-x64.node`
- Windows x64 → `native/recorder.win32-x64-msvc.node`

说明：

- `native-rs/recorder-napi/index.js` 里列出多平台只是**运行时加载模板**，不会在一台机器上自动编出全部平台。
- **Windows 的 `.node` 必须在 Windows（或 Windows CI）上编译**，不能在 Mac 上直接产出。
- 改了 `native-rs/` 下 Rust 代码后，需再跑一次 `npm run build:native`，并**完全重启** `npm run dev`（原生模块会被进程缓存）。

### 4. 开发运行

```bash
npm run build:native   # 若尚未编译过插件
npm run dev
```

录屏：托盘右键 → 开始 / 暂停·继续 / 停止；默认麦克风 + 系统声；文件默认在应用 `userData/recordings/`。

其它常用命令：

```bash
npm run typecheck      # TypeScript / Vue 类型检查
npm run lint
npm run format
```

### 5. 打包安装包

先确保当前平台的 `.node` 已在 `native/` 中，且 `node_modules/ffmpeg-static` 下已有当前平台的 `ffmpeg`（`npm install` 时下载），再打包（`electron-builder` 会把 `native/*.node` 与 ffmpeg 可执行文件打进 `extraResources`）：

```bash
# macOS（dmg + zip，产物在 dist/）
npm run build:mac

# Windows（需在 Windows 上，且已有 win 的 .node）
npm run build:win

# Linux
npm run build:linux

# 仅解包目录、不打安装包（调试用）
npm run build:unpack
```

`build:mac` / `build:win` / `build:linux` 内部会先跑 `npm run build`（typecheck + electron-vite 构建），再调用 electron-builder。

跨平台发版时：在对应系统（或 CI）分别执行 `build:native` + 对应 `build:*`，汇总各平台安装包。

### 6. 发版与自动更新（可选）

1. 改 `package.json` 的 `version`（如 `1.0.0` → `1.0.1`）
2. 打包：`npm run build:mac` / `build:win`（产物在 `dist/`，含 `latest-mac.yml` / `latest.yml`）
3. 在 Gitee 建长期 Release，**tag 固定为 `updater`**，把下列文件上传到该 Release（覆盖旧文件）：
   - mac：`latest-mac.yml` + `*.zip`（自动更新用）+ 可选 `.dmg`（给人装）
   - win：`latest.yml` + `*-setup.exe`
4. 用户端：打包版启动约 5 秒后自动检查；设置 → 通用 →「检查更新」；下载完可「重启安装」

更新源地址见 `electron-builder.yml` 的 `publish.url`（须能直接 HTTP 下载到上述 yml/安装包）。

**注意**：macOS 自动更新需要代码签名；未签名时检查/安装可能失败（设置页会显示错误信息）。

### 7. 常见问题

| 现象 | 处理 |
|------|------|
| 录屏不可用 / 找不到 `.node` | 执行 `npm run build:native`，确认 `native/` 下有当前平台文件 |
| `ffmpeg not found` | 执行 `npm install` 确保 `ffmpeg-static` 已下载；打包版应自带 `Resources/bin/ffmpeg` |
| 改了 Rust 但行为没变 | 重新 `build:native` 后**整进程重启** `npm run dev` |
| macOS 无系统声 | 系统设置 → 隐私与安全性，允许麦克风及「音频 / 屏幕与系统音频录制」；开发态依赖 Electron.app 的 plist 文案（`postinstall` / `build:native` 会尝试写入） |
| Windows 编不过原生模块 | 安装 VS Build Tools（MSVC），在 **Windows** 上执行 `npm run build:native` |

## 主进程 ↔ 渲染进程通讯

渲染进程不直接使用 `ipcRenderer`，统一走：

```
Renderer (window.api.xxx)
    → Preload (ipcRenderer.invoke / send / on)
        → Main (ipcMain.handle / on  或  webContents.send)
```

### 通讯模式

| 模式 | Renderer | Preload | Main | 说明 |
|------|----------|---------|------|------|
| 请求-响应 | `await window.api.xxx()` | `ipcRenderer.invoke` | `ipcMain.handle` | 需要返回值 |
| 单向通知 | `window.api.xxx()` | `ipcRenderer.send` | `ipcMain.on` | 无需返回值 |
| 订阅推送 | `window.api.onXxx(cb)` | `ipcRenderer.on`（返回取消函数） | `webContents.send` | Main 主动推给 Renderer |

### 相关文件（调用链顺序）

| 层级 | 路径 |
|------|------|
| Renderer 调用 / 类型 | 页面、composables；`src/renderer/src/env.d.ts` |
| Preload 合并入口 | `src/preload/index.ts` |
| Preload bridge | `src/preload/modules/app.ts`、`clipboard.ts`、`projects.ts` |
| Main IPC | `src/main/modules/core/ipc.ts`、`clipboard/ipc.ts`、`projects/ipc.ts` |
| Main 推送发出 | `panelWindow.ts`、`settingsWindow.ts`、`main/index.ts` |

---

### 通用（core）— Renderer → Preload → Main

| Renderer `window.api` | Preload | Main Channel | 说明 |
|-----------------------|---------|--------------|------|
| `getConfig()` | `invoke` | `config:get` | 读取完整配置 → `AppConfig` |
| `updateConfig(patch)` | `invoke` | `config:update` | 局部更新；快捷键失败回滚 → `ConfigUpdateResult` |
| `suspendShortcuts()` | `invoke` | `shortcuts:suspend` | 录制快捷键前卸掉全局注册 |
| `resumeShortcuts()` | `invoke` | `shortcuts:resume` | 录制结束 / 取消 / 关设置窗后恢复 |
| `hidePanel()` | `send` | `panel:hide` | 隐藏独立剪贴板浮层（不影响功能面板） |
| `openSettings()` | `send` | `settings:open` | 打开设置窗口 |
| `getUpdateStatus()` | `invoke` | `updater:status` | 当前更新状态 |
| `checkForUpdates()` | `invoke` | `updater:check` | 检查更新 |
| `installUpdate()` | `invoke` | `updater:install` | 重启安装已下载更新 |
| `onUpdateStatus(cb)` | `on` ← | `updater:status` | 更新状态推送 |
| `onPanelShown(cb)` | `on` ← | `panel:shown` | 面板每次显示时推送（返回取消函数） |
| `onSettingsShown(cb)` | `on` ← | `settings:shown` | 设置窗再次打开时推送（返回取消函数） |

### 剪贴板（clipboard）— Renderer → Preload → Main

| Renderer `window.api` | Preload | Main Channel | 说明 |
|-----------------------|---------|--------------|------|
| `listHistory()` | `invoke` | `history:list` | 拉取全部历史 → `ClipRecord[]` |
| `removeHistory(id)` | `invoke` | `history:remove` | 删除单条历史 |
| `clearHistory()` | `invoke` | `history:clear` | 清空历史（不影响收藏） |
| `listFavorites()` | `invoke` | `favorite:list` | 拉取全部收藏 → `ClipRecord[]` |
| `addFavorite(historyId)` | `invoke` | `favorite:add` | 从历史拷贝到收藏（内容去重） |
| `removeFavorite(id)` | `invoke` | `favorite:remove` | 取消收藏（删除） |
| `pasteItems(ids)` | `invoke` | `clip:paste` | 恢复原焦点后模拟粘贴（历史或收藏） |
| `onHistoryUpdated(cb)` | `on` ← | `history:updated` | 历史变更后同步列表 |
| `onFavoritesUpdated(cb)` | `on` ← | `favorite:updated` | 收藏变更后同步列表 |

### 项目（projects）— Renderer → Preload → Main

| Renderer `window.api` | Preload | Main Channel | 说明 |
|-----------------------|---------|--------------|------|
| `pickWorkspace()` | `invoke` | `projects:pickWorkspace` | 系统目录对话框 → 路径或 null |
| `setWorkspace(root)` | `invoke` | `projects:setWorkspace` | 写入工作区并扫描 → `ScannedProject[]` |
| `openWorkspace()` | `invoke` | `projects:openWorkspace` | 在文件管理器中打开工作区 |
| `scanProjects()` | `invoke` | `projects:scan` | 按当前配置扫描 |
| `updateProjectOverride(folder, patch)` | `invoke` | `projects:updateOverride` | 更新显示名/入口 |
| `startProject(folder)` | `invoke` | `projects:start` | 起静态服务 → `ProjectRuntimeInfo` |
| `stopProject(folder)` | `invoke` | `projects:stop` | 停止静态服务 |
| `listRunningProjects()` | `invoke` | `projects:listRunning` | 当前运行中的项目 |

表中 `on ←` 表示推送方向为 Main → Preload → Renderer 回调；其余为 Renderer 主动发起。

### 约定

1. **新增通道**：Renderer 只调 `window.api` → Preload `modules/*.ts` 封装 → Main `ipc.ts` 注册。
2. **订阅类 API**（`on*`）必须返回取消函数，并在组件 `onUnmounted` 中调用。
3. **Channel 命名**：`模块:动作`（如 `history:list`、`panel:shown`）。
