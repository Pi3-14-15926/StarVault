/* ====== 项目核心类型定义 ====== */

/** 下载项 */
export interface Download {
  platform: 'Android' | 'Windows' | 'MacOS' | 'Linux' | 'Other'
  filename: string
  size: string         // 如 "12.5 MB"
  url: string
}

/** 版本 */
export interface Version {
  id: string
  version: string
  publishedAt: string   // ISO 日期
  changelog: string
  downloads: Download[]
}

/** 项目类型 */
export type SourceType = 'github' | 'custom'

/** 项目 */
export interface Project {
  id: string
  slug: string
  sourceType: SourceType
  name: string
  description: string
  logo: string
  categoryId: string
  featured: boolean
  githubRepo?: string   // owner/repo
  githubUrl?: string
  website?: string
  stars?: number
  forks?: number
  latestVersion: string
  latestUpdateTime: string
  versions: Version[]
}

/** 页面（原分类） */
export interface Category {
  id: string
  name: string
  slug: string
  icon?: string
  description?: string
  sortOrder?: number
}

/** 定时调度设置 */
export interface ScheduleConfig {
  syncEnabled: boolean
  syncIntervalHours: number
  backupEnabled: boolean
  backupIntervalHours: number
}

/** WebDAV 配置 */
export interface WebDAVConfig {
  url: string
  username: string
  password: string
  baseDir: string
}

/** 站点设置 */
export interface Settings {
  siteName: string
  logo: string
  footer?: string
  admins: string[]
  storageNote?: string
  ghProxyEnabled?: boolean
  ghProxyUrl?: string
  schedule?: ScheduleConfig
  webdav?: WebDAVConfig
}

/** GitHub Release API 返回的 Asset */
export interface GitHubAsset {
  name: string
  size: number
  browser_download_url: string
  content_type: string
}

/** GitHub Release API 返回 */
export interface GitHubRelease {
  tag_name: string
  published_at: string
  body: string
  assets: GitHubAsset[]
}

/** 同步结果 */
export interface SyncResult {
  projectId: string
  success: boolean
  error?: string
  newVersions?: number
}
