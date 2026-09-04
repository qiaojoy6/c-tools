# clipboard

## 功能

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

## 相关文件

- `src/main/modules/clipboard/` — watcher / history / favorites / paste / ipc
- `src/renderer/src/pages/ClipboardPage.vue` — 剪贴板内容（独立路由与面板内嵌共用）
- `src/renderer/src/modules/clipboard/` — 卡片、useHistory
- `src/preload/modules/clipboard.ts`
- `src/shared/modules/clipboard.ts`
