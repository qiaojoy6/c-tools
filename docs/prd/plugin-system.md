# 插件系统架构计划

目标：内置模块与第三方插件共用同一套贡献点（contribution points）。先可插拔，后可分发。

---

## 现状

- 主进程业务模块均经 `FeatureHost`：clipboard / projects / quickFolders / screenshot / recorder
- bootstrap 仅壳：窗口 / 菜单 / Host 注册 / shortcuts 聚合 / tray / core IPC / 退出
- Panel / Settings 贡献表带 `component`；按 `features.enabled` 过滤
- 跨模块经 `FeatureContext.shared`；托盘 `bindTray`；快捷键 `bindShortcuts`
- preload 经 `PRELOAD_BRIDGES` 组装
- 功能开关支持运行时软切换 + **热加载**（启动未 setup 的模块首次开启时 setup/IPC）
- 尚未：第三方动态加载 / capability

---

## 贡献点

| Slot | 状态 |
|------|------|
| `panel.tab` / `settings.tab` | 已落地 + enabled 过滤 |
| `ipc` / `lifecycle` / `shortcut` / `tray` | 已落地 |
| `shared services` | ClipboardHostServices |
| `features.enabled` | 配置 + Host + UI + 软切换 + 热加载 |
| `preload` | `PRELOAD_BRIDGES` + assemblePreloadApi |
| `config` schema / `window` | 后续 |

---

## 分阶段

### P0 — 完成

内置 Feature 契约、全部业务迁入 Host。

### P1 — 完成

- `bindTray` / `bindShortcuts` / Panel·Settings 组件注册
- `features.enabled` + 设置页开关
- 运行时软切换（快捷键/托盘/剪贴板 watcher）
- preload 注册表
- **热加载**：`FeatureHost.syncRuntimeFeatures` 对未 setup 模块执行 setup + registerIpc；设置页 toast 反馈；截屏/录屏在 setup 内 `prewarm`，避免首次开启黑屏

### P2 — 外部插件（可选）

`plugin.json` + 沙箱 + capability。

---

## 开关行为

| 操作 | 行为 |
|------|------|
| 关闭已加载模块 | 侧栏隐藏；快捷键/托盘不贡献；剪贴板暂停监听；句柄保留便于再开 |
| 再打开已加载模块 | 立即恢复贡献与监听 |
| 开启启动时未加载的模块 | 热 setup + 注册 IPC；toast「已启用…」 |
| 关剪贴板 | 配置连带关截屏；截屏依赖剪贴板 |

---

## 相关文件

- `src/main/modules/feature/` — Host / defineFeature / FeatureShared
- `src/main/modules/*/feature.ts`
- `src/preload/feature/` — PRELOAD_BRIDGES
- `src/shared/modules/feature.ts` — FeaturesConfig
- `src/renderer/src/modules/feature/` — enabled / toggles
- `src/renderer/src/modules/settings/components/GeneralSettings.vue` — 功能模块开关
