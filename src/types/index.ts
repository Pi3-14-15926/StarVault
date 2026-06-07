/* ====== 项目核心类型定义 ====== */

/** 支持的平台（7 个：移动/桌面/服务器/网页） */
export type Platform = 'Android' | 'Windows' | 'MacOS' | 'Linux' | 'iOS' | 'Web' | 'Other'

/** 项目类型 */
export type SourceType = 'github' | 'custom'

/** 软件（项目主实体） */
export interface Software {
  id: string
  slug: string
  sourceType: SourceType
  name: string
  description: string
  logo: string
  categorySlug: string
  featured: boolean
  githubRepo?: string
  githubUrl?: string
  website?: string
  stars?: number
  forks?: number
  latestVersionId?: string
  latestUpdateTime: string
}

/** 版本（属于某个 Software） */
export interface Version {
  id: string
  projectId: string
  version: string
  publishedAt: string
  changelog: string
  downloadIds: string[]
}

/** 下载项（属于某个 Version） */
export interface Download {
  id: string
  versionId: string
  platform: Platform
  filename: string
  size: string
  url: string
  /** 真实下载量（仅 GitHub Release 来源可获取，自定义 URL 留空） */
  downloadCount?: number
  /** 真实下载量的拉取时间 ISO 字符串 */
  downloadCountSyncedAt?: string
}

/** 全站搜索索引（轻量：不含 versions/downloads；平台由 Download 派生） */
export interface IndexEntry {
  id: string
  name: string
  slug: string
  categorySlug: string
  description: string
  logo: string
  featured: boolean
  latestVersionId?: string
  latestUpdateTime: string
  githubRepo?: string
  githubUrl?: string
  website?: string
  stars?: number
  forks?: number
}

/** 页面（原分类） */
export interface Category {
  id: string
  slug: string
  name: string
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
  uploadTimeout?: number
  maxFileSize?: number
}

/** 图标库资源 */
export interface IconAsset {
  filename: string
  name: string
  size: number
  sha: string
  rawUrl: string
  cdnUrl: string
  uploadedAt: string
}

/** CDN 加速策略 */
export type IconCdnMode = 'jsdelivr' | 'statically' | 'githack' | 'custom' | 'none'

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
  iconCdnMode?: IconCdnMode
  iconCdnCustomBase?: string
}

/** GitHub Release API 返回的 Asset */
export interface GitHubAsset {
  name: string
  size: number
  browser_download_url: string
  content_type: string
  download_count: number
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
  projectName?: string
  repo?: string
  success: boolean
  error?: string
  status?: number
  newVersions?: number
  fixedVersions?: number
}

/** enrichDownloadCounts 单个失败详情 */
export interface EnrichError {
  group: string
  url: string
  status?: number
  message: string
}

/** enrichDownloadCounts 实时进度回调参数 */
export interface EnrichProgress {
  done: number
  total: number
  currentGroup: string
  status: 'ok' | 'rate-limit' | 'retry' | 'error'
  ok: number
  rateLimited: number
  errored: number
  retried: number
  errors: EnrichError[]
}

/** ====== 运行时数据聚合（前端用） ====== */

/** 完整的软件（含版本和下载） */
export interface SoftwareWithDetails extends Software {
  versions: Version[]
}

/** 完整的版本（含下载） */
export interface VersionWithDownloads extends Version {
  downloads: Download[]
}

/** 完整应用状态（localStorage 存储模型） */
export interface AppData {
  index: IndexEntry[]
  software: Record<string, Software[]>
  versions: Record<string, Version[]>
  downloads: Record<string, Download[]>
  categories: Category[]
  settings: Settings
  iconAssets: IconAsset[]
  backupManifest: { entries: any[]; updatedAt: string }
}
