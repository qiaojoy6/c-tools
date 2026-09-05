import { dialog, ipcMain } from 'electron'
import type { ProjectOverride, ProjectRuntimeInfo, ScannedProject } from '@shared/types'
import type { ConfigManager } from '../../config'
import { scanWorkspace } from './scan'
import type { ProjectsRuntime } from './runtime'

export interface ProjectsIpcDeps {
  config: ConfigManager
  runtime: ProjectsRuntime
}

/**
 * 项目模块 IPC
 *
 * | Channel                  | 说明 |
 * |--------------------------|------|
 * | projects:pickWorkspace   | 系统目录对话框选工作区 |
 * | projects:setWorkspace    | 写入工作区路径并返回扫描结果 |
 * | projects:scan            | 按当前配置扫描 |
 * | projects:updateOverride  | 更新显示名/入口 |
 * | projects:start           | 启动静态服务 |
 * | projects:stop            | 停止静态服务 |
 * | projects:listRunning     | 当前运行中的项目 |
 */
export function registerProjectsIpc(deps: ProjectsIpcDeps): void {
  const { config, runtime } = deps

  ipcMain.handle('projects:pickWorkspace', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: '选择工作区根目录',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })

  ipcMain.handle('projects:setWorkspace', (_e, root: string | null): ScannedProject[] => {
    const projects = config.get().projects
    config.replaceProjects({
      workspaceRoot: root?.trim() || null,
      overrides: projects.overrides
    })
    return scanWorkspace(config.get().projects)
  })

  ipcMain.handle('projects:scan', (): ScannedProject[] => {
    return scanWorkspace(config.get().projects)
  })

  ipcMain.handle(
    'projects:updateOverride',
    (_e, folderName: string, patch: ProjectOverride): ScannedProject[] => {
      const projects = structuredClone(config.get().projects)
      const prev = projects.overrides[folderName] ?? {}
      const next: ProjectOverride = { ...prev }

      if (patch.displayName !== undefined) {
        const name = patch.displayName.trim()
        if (name) next.displayName = name
        else delete next.displayName
      }
      if (patch.entryPath !== undefined) {
        const entry = patch.entryPath.trim().replace(/\\/g, '/')
        if (entry) next.entryPath = entry
        else delete next.entryPath
      }

      if (!next.displayName && !next.entryPath) {
        delete projects.overrides[folderName]
      } else {
        projects.overrides[folderName] = next
      }

      config.replaceProjects(projects)
      return scanWorkspace(config.get().projects)
    }
  )

  ipcMain.handle(
    'projects:start',
    async (_e, folderName: string): Promise<ProjectRuntimeInfo> => {
      return runtime.start(config.get().projects, folderName)
    }
  )

  ipcMain.handle('projects:stop', async (_e, folderName: string): Promise<boolean> => {
    return runtime.stop(folderName)
  })

  ipcMain.handle('projects:listRunning', (): ProjectRuntimeInfo[] => {
    return runtime.listRunning()
  })
}
