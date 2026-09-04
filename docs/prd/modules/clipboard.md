# clipboard

## 功能

- 后台监听系统剪贴板（纯文本、图片）
- 历史记录：去重、置顶、本地持久化、条数上限、过期清理
- 面板：搜索、类型筛选（全部/文本/图片）、列表展示
- 打开面板不自动聚焦搜索；敲击英文/数字时才聚焦并输入；⌘/Ctrl+F 手动聚焦
- ← / → 未聚焦搜索时切换类型筛选；聚焦后为移动光标；↑ / ↓ 切换列表
- 文本超长默认收起 3 行，可展开/收起
- 图片缩略图，hover 预览原图
- 双击 / Enter 粘贴到原光标处；空格多选、Shift 批量粘贴
- 单条删除、一键清空
- 粘贴后关闭面板；ESC / 失焦关闭

## 相关文件

- `src/main/modules/clipboard/` — watcher / history / paste / ipc
- `src/renderer/src/modules/clipboard/` — 面板、卡片、useHistory
- `src/preload/modules/clipboard.ts`
- `src/shared/modules/clipboard.ts`
