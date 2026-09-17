/** 应用自动更新相关共享类型 */

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateStatus {
  state: UpdateState
  /** 当前运行版本 */
  currentVersion: string
  /** 远端新版本（有更新时） */
  availableVersion?: string
  /** 下载进度 0–100 */
  percent?: number
  /** 错误或提示文案 */
  message?: string
  /** 是否打包环境（dev 下通常不可更新） */
  canUpdate: boolean
  /** mac：未签名时走 GitHub 手动下载，不自动安装 */
  manualDownload?: boolean
  /** 手动下载页（GitHub Releases） */
  releaseUrl?: string
}
