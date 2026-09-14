import { defineFeature, type FeatureHandles } from '../feature'
import { ProjectsRuntime } from './runtime'
import { registerProjectsIpc } from './ipc'

/** projects Feature 的 setup 句柄 */
export type ProjectsFeatureHandles = FeatureHandles & {
  runtime: ProjectsRuntime
}

/**
 * 项目模块主进程 Feature（P0 样板）
 * 贡献：lifecycle（runtime）+ IPC namespace `projects:*`
 */
export const projectsFeature = defineFeature({
  id: 'projects',
  setup(): ProjectsFeatureHandles {
    const runtime = new ProjectsRuntime()
    return {
      runtime,
      dispose: () => {
        void runtime.stopAll()
      }
    }
  },
  registerIpc(ctx, handles) {
    registerProjectsIpc({
      config: ctx.config,
      runtime: (handles as ProjectsFeatureHandles).runtime
    })
  }
})
