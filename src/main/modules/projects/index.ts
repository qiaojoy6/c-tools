/** 项目模块：工作区扫描、静态服务、运行时、IPC */
export { scanWorkspace, resolveEntryPath, ROOT_PROJECT_ID } from './scan'
export { startStaticServer } from './staticServer'
export { ProjectsRuntime } from './runtime'
export { registerProjectsIpc } from './ipc'
export type { ProjectsIpcDeps } from './ipc'
