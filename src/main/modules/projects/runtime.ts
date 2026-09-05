import type { ProjectRuntimeInfo, ProjectsConfig, ScannedProject } from '@shared/types'
import { scanWorkspace } from './scan'
import { startStaticServer, type StaticServerHandle } from './staticServer'

interface RunningEntry {
  handle: StaticServerHandle
  displayName: string
}

/**
 * 运行时：每个 folderName 最多一个静态服务
 */
export class ProjectsRuntime {
  private running = new Map<string, RunningEntry>()

  listRunning(): ProjectRuntimeInfo[] {
    return [...this.running.entries()].map(([folderName, entry]) => ({
      folderName,
      displayName: entry.displayName,
      url: entry.handle.url,
      port: entry.handle.port
    }))
  }

  get(folderName: string): ProjectRuntimeInfo | null {
    const entry = this.running.get(folderName)
    if (!entry) return null
    return {
      folderName,
      displayName: entry.displayName,
      url: entry.handle.url,
      port: entry.handle.port
    }
  }

  /** 启动项目静态服务；已运行则直接返回现有信息 */
  async start(config: ProjectsConfig, folderName: string): Promise<ProjectRuntimeInfo> {
    const existing = this.get(folderName)
    if (existing) return existing

    const projects = scanWorkspace(config)
    const project = projects.find((p) => p.folderName === folderName)
    if (!project) {
      throw new Error(`未找到项目：${folderName}`)
    }

    return this.startProject(project)
  }

  private async startProject(project: ScannedProject): Promise<ProjectRuntimeInfo> {
    const handle = await startStaticServer(project.absPath, {
      entryPath: project.entryPath,
      basePath: project.basePath
    })
    this.running.set(project.folderName, {
      handle,
      displayName: project.displayName
    })
    return {
      folderName: project.folderName,
      displayName: project.displayName,
      url: handle.url,
      port: handle.port
    }
  }

  async stop(folderName: string): Promise<boolean> {
    const entry = this.running.get(folderName)
    if (!entry) return false
    this.running.delete(folderName)
    try {
      await entry.handle.close()
    } catch (err) {
      console.error('[projects] stop server failed:', err)
    }
    return true
  }

  async stopAll(): Promise<void> {
    const names = [...this.running.keys()]
    await Promise.all(names.map((name) => this.stop(name)))
  }
}
