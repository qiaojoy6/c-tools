/** ============ 项目模块共享类型（静态产物预览） ============ */

/** 单个项目的用户覆盖（按一级子目录名索引） */
export interface ProjectOverride {
  /** 列表/页签显示名；缺省用文件夹名 */
  displayName?: string
  /** 相对项目目录的入口 HTML；缺省自动探测 index.html / dist/index.html */
  entryPath?: string
  /**
   * 构建产物的 URL 基础路径（如 `/app/`）；缺省为 `/`
   * 预览 URL 会挂在此前缀下，静态资源按此前缀剥离后查找
   */
  basePath?: string
}

/** 项目模块持久化配置 */
export interface ProjectsConfig {
  /** 工作区根路径；null 表示未选择 */
  workspaceRoot: string | null
  /** folderName → 覆盖项 */
  overrides: Record<string, ProjectOverride>
}

/** 扫描得到的可启动项目 */
export interface ScannedProject {
  /** 一级子目录名（稳定 id） */
  folderName: string
  /** 绝对路径 */
  absPath: string
  /** 展示名 */
  displayName: string
  /** 相对项目目录的入口 HTML */
  entryPath: string
  /** 规范化后的 URL 前缀，无自定义时为 `''`（即站点根 `/`） */
  basePath: string
}

/** 启动成功后的运行信息 */
export interface ProjectRuntimeInfo {
  folderName: string
  displayName: string
  /** 本地预览 URL，如 http://127.0.0.1:54321/ 或带 base 的 …/app/ */
  url: string
  port: number
}
