# c-tools

An Electron application with Vue and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)

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
| Preload bridge | `src/preload/modules/app.ts`、`clipboard.ts` |
| Main IPC | `src/main/modules/core/ipc.ts`、`clipboard/ipc.ts` |
| Main 推送发出 | `panelWindow.ts`、`settingsWindow.ts`、`main/index.ts` |

---

### 通用（core）— Renderer → Preload → Main

| Renderer `window.api` | Preload | Main Channel | 说明 |
|-----------------------|---------|--------------|------|
| `getConfig()` | `invoke` | `config:get` | 读取完整配置 → `AppConfig` |
| `updateConfig(patch)` | `invoke` | `config:update` | 局部更新；快捷键失败回滚 → `ConfigUpdateResult` |
| `suspendShortcuts()` | `invoke` | `shortcuts:suspend` | 录制快捷键前卸掉全局注册 |
| `resumeShortcuts()` | `invoke` | `shortcuts:resume` | 录制结束 / 取消 / 关设置窗后恢复 |
| `hidePanel()` | `send` | `panel:hide` | 隐藏剪贴板面板 |
| `openSettings()` | `send` | `settings:open` | 打开设置窗口 |
| `onPanelShown(cb)` | `on` ← | `panel:shown` | 面板每次显示时推送（返回取消函数） |
| `onSettingsShown(cb)` | `on` ← | `settings:shown` | 设置窗再次打开时推送（返回取消函数） |

### 剪贴板（clipboard）— Renderer → Preload → Main

| Renderer `window.api` | Preload | Main Channel | 说明 |
|-----------------------|---------|--------------|------|
| `listHistory()` | `invoke` | `history:list` | 拉取全部历史 → `ClipRecord[]` |
| `removeHistory(id)` | `invoke` | `history:remove` | 删除单条 |
| `clearHistory()` | `invoke` | `history:clear` | 清空全部 |
| `pasteItems(ids)` | `invoke` | `clip:paste` | 恢复原焦点后模拟粘贴 |
| `onHistoryUpdated(cb)` | `on` ← | `history:updated` | 监听捕获或配置裁剪后同步列表（返回取消函数） |

表中 `on ←` 表示推送方向为 Main → Preload → Renderer 回调；其余为 Renderer 主动发起。

### 约定

1. **新增通道**：Renderer 只调 `window.api` → Preload `modules/*.ts` 封装 → Main `ipc.ts` 注册。
2. **订阅类 API**（`on*`）必须返回取消函数，并在组件 `onUnmounted` 中调用。
3. **Channel 命名**：`模块:动作`（如 `history:list`、`panel:shown`）。
