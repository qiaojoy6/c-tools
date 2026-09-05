import { ipcRenderer } from 'electron'
import type { ProjectOverride, ProjectRuntimeInfo, ScannedProject } from '@shared/types'

/**
 * 项目模块 bridge（对应 main/modules/projects/ipc.ts）
 */
export const projectsApi = {
  /** projects:pickWorkspace — 系统目录对话框，取消返回 null */
  pickWorkspace: (): Promise<string | null> => ipcRenderer.invoke('projects:pickWorkspace'),

  /** projects:setWorkspace — 写入工作区并扫描 */
  setWorkspace: (root: string | null): Promise<ScannedProject[]> =>
    ipcRenderer.invoke('projects:setWorkspace', root),

  /** projects:scan */
  scanProjects: (): Promise<ScannedProject[]> => ipcRenderer.invoke('projects:scan'),

  /** projects:updateOverride */
  updateProjectOverride: (
    folderName: string,
    patch: ProjectOverride
  ): Promise<ScannedProject[]> => ipcRenderer.invoke('projects:updateOverride', folderName, patch),

  /** projects:start */
  startProject: (folderName: string): Promise<ProjectRuntimeInfo> =>
    ipcRenderer.invoke('projects:start', folderName),

  /** projects:stop */
  stopProject: (folderName: string): Promise<boolean> =>
    ipcRenderer.invoke('projects:stop', folderName),

  /** projects:listRunning */
  listRunningProjects: (): Promise<ProjectRuntimeInfo[]> =>
    ipcRenderer.invoke('projects:listRunning')
}

export type ProjectsApi = typeof projectsApi
