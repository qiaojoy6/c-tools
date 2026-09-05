# c-tools
c-tools 是一款基于 Electron + Vue 的桌面效率工具，目前以剪贴板管理为核心。

它会在后台监听系统剪贴板（文本、图片），保存历史并支持收藏；可通过快捷键呼出独立浮层，或从托盘打开功能面板，搜索、筛选后粘贴回原应用。另有设置（快捷键、条数上限、过期清理、开机自启等），托盘常驻，关窗不退出

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```

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
