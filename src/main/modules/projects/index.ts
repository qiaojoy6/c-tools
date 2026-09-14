/** 项目模块公共面：运行时 + IPC + Feature 描述（扫描/静态服务由模块内相对路径使用） */
export { ProjectsRuntime } from './runtime'
export { registerProjectsIpc } from './ipc'
export type { ProjectsIpcDeps } from './ipc'
export { projectsFeature } from './feature'
export type { ProjectsFeatureHandles } from './feature'
