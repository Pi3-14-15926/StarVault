/** 数据访问层 —— 分层存储模型
 *  - localStorage: 单 key 'sh_data' 存储完整 AppData（便于管理端读写）
 *  - 公共 JSON: data/index.json + page/{slug}/{software,versions,downloads}.json
 *  - loadRemoteData() 把所有公共 JSON 合并到 localStorage
 */
import type {
  Software, Version, Download, IndexEntry, Category, Settings,
  IconAsset, SyncResult, AppData, Platform, EnrichProgress, EnrichError, GitHubRelease,
} from '../types'
import { uid, fmtCompact } from './index'
import { fetchReleases, releaseToVersion, fetchRepoInfo, fetchReleaseByTag, guessPlatform } from './github'
import { DEFAULT_SETTINGS } from '../defaults'

/* ========== 基础读写 ========== */
const KEY = 'sh_data'

async function pMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency = 4,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const idx = cursor++
      if (idx >= items.length) return
      results[idx] = await fn(items[idx], idx)
    }
  })
  await Promise.all(workers)
  return results
}

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}
export function saveJSON<T>(key: string, data: T): void {
  localStorage.setItem(key, JSON.stringify(data))
}

/* ========== 完整应用状态（AppData） ========== */
function emptyAppData(): AppData {
  return {
    index: [],
    software: {},
    versions: {},
    downloads: {},
    categories: [],
    settings: { ...DEFAULT_SETTINGS },
    iconAssets: [],
    backupManifest: { entries: [], updatedAt: new Date().toISOString() },
  }
}

export function loadAppData(): AppData {
  const raw = localStorage.getItem(KEY)
  if (raw === null) {
    if (_appDataCache) return _appDataCache.parsed
    const parsed = emptyAppData()
    _appDataCache = { raw: null, parsed }
    return parsed
  }
  if (_appDataCache && _appDataCache.raw === raw) return _appDataCache.parsed
  const partial = JSON.parse(raw) as Partial<AppData>
  const parsed: AppData = {
    ...emptyAppData(),
    ...partial,
    settings: { ...DEFAULT_SETTINGS, ...(partial.settings || {}) },
  }
  _appDataCache = { raw, parsed }
  return parsed
}

export function saveAppData(d: AppData): void {
  saveJSON(KEY, d)
  invalidateDerivedCaches()
}

const _platformsCache = new Map<string, Platform[]>()
const _realDLCache = new Map<string, number | null>()
const _versionsByProjectCache = new Map<string, Version[]>()
const _versionByIdCache = new Map<string, Version | undefined>()
const _downloadsByVersionCache = new Map<string, Download[]>()
let _allSoftwareCache: { data: AppData; list: Software[] } | null = null
let _appDataCache: { raw: string | null; parsed: AppData } | null = null

function invalidateDerivedCaches() {
  _platformsCache.clear()
  _realDLCache.clear()
  _versionsByProjectCache.clear()
  _versionByIdCache.clear()
  _downloadsByVersionCache.clear()
  _allSoftwareCache = null
  _appDataCache = null
}

/* ========== Software ========== */
export function getAllSoftware(): Software[] {
  const d = loadAppData()
  if (_allSoftwareCache && _allSoftwareCache.data === d) return _allSoftwareCache.list
  const list = Object.values(d.software).flat()
  _allSoftwareCache = { data: d, list }
  return list
}

export function getSoftwareBySlug(slug: string): Software | undefined {
  return getAllSoftware().find((s) => s.slug === slug)
}

export function getSoftwareById(id: string): Software | undefined {
  return getAllSoftware().find((s) => s.id === id)
}

export function getCategorySoftware(slug: string): Software[] {
  return loadAppData().software[slug] || []
}

export function saveSoftware(s: Software): void {
  const d = loadAppData()
  if (!d.software[s.categorySlug]) d.software[s.categorySlug] = []
  const list = d.software[s.categorySlug]
  const idx = list.findIndex((x) => x.id === s.id)
  if (idx >= 0) list[idx] = s
  else list.push(s)
  rebuildIndexInPlace(d)
  saveAppData(d)
}

export function deleteSoftware(id: string): void {
  const d = loadAppData()
  for (const slug of Object.keys(d.software)) {
    d.software[slug] = d.software[slug].filter((x) => x.id !== id)
  }
  // 删版本和下载
  for (const slug of Object.keys(d.versions)) {
    d.versions[slug] = d.versions[slug].filter((v) => v.projectId !== id)
  }
  for (const slug of Object.keys(d.downloads)) {
    const removedVIds = new Set(
      Object.values(d.versions).flat().filter((v) => v.projectId === id).map((v) => v.id)
    )
    d.downloads[slug] = d.downloads[slug].filter((dl) => !removedVIds.has(dl.versionId))
  }
  rebuildIndexInPlace(d)
  saveAppData(d)
}

/* ========== Version ========== */
export function getSoftwareVersions(softwareId: string): Version[] {
  const cached = _versionsByProjectCache.get(softwareId)
  if (cached) return cached
  const d = loadAppData()
  const result = Object.values(d.versions).flat()
    .filter((v) => v.projectId === softwareId)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
  _versionsByProjectCache.set(softwareId, result)
  return result
}

export function getVersionById(id: string): Version | undefined {
  if (_versionByIdCache.has(id)) return _versionByIdCache.get(id)
  const d = loadAppData()
  const result = Object.values(d.versions).flat().find((v) => v.id === id)
  _versionByIdCache.set(id, result)
  return result
}

/** 派生：软件真实支持的平台集合（基于其所有版本的下载项 platform） */
export function getSoftwarePlatforms(softwareId: string): Platform[] {
  const cached = _platformsCache.get(softwareId)
  if (cached) return cached
  const set = new Set<Platform>()
  for (const v of getSoftwareVersions(softwareId)) {
    for (const dl of getVersionDownloads(v.id)) set.add(dl.platform)
  }
  const result = Array.from(set)
  _platformsCache.set(softwareId, result)
  return result
}

export function latestVersionText(s: Software): string {
  if (!s.latestVersionId) return ''
  return getVersionById(s.latestVersionId)?.version || ''
}

export function addVersion(v: Version): void {
  const d = loadAppData()
  const sw = getSoftwareById(v.projectId)
  if (!sw) return
  if (!d.versions[sw.categorySlug]) d.versions[sw.categorySlug] = []
  d.versions[sw.categorySlug].push(v)
  // 更新 software 的 latestVersionId/latestUpdateTime
  sw.latestVersionId = v.id
  sw.latestUpdateTime = v.publishedAt
  // 同时保存 software
  if (!d.software[sw.categorySlug]) d.software[sw.categorySlug] = []
  const sList = d.software[sw.categorySlug]
  const sIdx = sList.findIndex((x) => x.id === sw.id)
  if (sIdx >= 0) sList[sIdx] = sw
  rebuildIndexInPlace(d)
  saveAppData(d)
}

export function deleteVersion(id: string): void {
  const d = loadAppData()
  const v = getVersionById(id)
  if (!v) return
  const sw = getSoftwareById(v.projectId)
  if (!sw) return
  d.versions[sw.categorySlug] = (d.versions[sw.categorySlug] || []).filter((x) => x.id !== id)
  d.downloads[sw.categorySlug] = (d.downloads[sw.categorySlug] || []).filter((dl) => dl.versionId !== id)
  // 重算 software 的 latestVersionId
  const vers = (d.versions[sw.categorySlug] || []).filter((x) => x.projectId === sw.id)
  vers.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
  if (vers.length > 0) {
    sw.latestVersionId = vers[0].id
    sw.latestUpdateTime = vers[0].publishedAt
  } else {
    sw.latestVersionId = undefined
    sw.latestUpdateTime = new Date(0).toISOString()
  }
  const sList = d.software[sw.categorySlug] || []
  const sIdx = sList.findIndex((x) => x.id === sw.id)
  if (sIdx >= 0) sList[sIdx] = sw
  rebuildIndexInPlace(d)
  saveAppData(d)
}

/* ========== Download ========== */
export function getVersionDownloads(versionId: string): Download[] {
  const cached = _downloadsByVersionCache.get(versionId)
  if (cached) return cached
  const d = loadAppData()
  const result = Object.values(d.downloads).flat().filter((dl) => dl.versionId === versionId)
  _downloadsByVersionCache.set(versionId, result)
  return result
}

export function getDownloadsByIds(ids: string[]): Download[] {
  const d = loadAppData()
  const all = Object.values(d.downloads).flat()
  const set = new Set(ids)
  return all.filter((dl) => set.has(dl.id))
}

export function addDownload(dl: Download): void {
  const d = loadAppData()
  const v = getVersionById(dl.versionId)
  if (!v) return
  const sw = getSoftwareById(v.projectId)
  if (!sw) return
  if (!d.downloads[sw.categorySlug]) d.downloads[sw.categorySlug] = []
  d.downloads[sw.categorySlug].push(dl)
  // 同步到 version.downloadIds
  const vList = d.versions[sw.categorySlug] || []
  const vIdx = vList.findIndex((x) => x.id === v.id)
  if (vIdx >= 0 && !vList[vIdx].downloadIds.includes(dl.id)) {
    vList[vIdx].downloadIds.push(dl.id)
  }
  saveAppData(d)
}

export function deleteDownload(id: string): void {
  const d = loadAppData()
  for (const slug of Object.keys(d.downloads)) {
    d.downloads[slug] = d.downloads[slug].filter((x) => x.id !== id)
  }
  for (const slug of Object.keys(d.versions)) {
    for (const v of d.versions[slug]) {
      v.downloadIds = v.downloadIds.filter((x) => x !== id)
    }
  }
  saveAppData(d)
}

/** 更新已有下载项（按 id 查找并替换） */
export function updateDownload(dl: Download): void {
  const d = loadAppData()
  for (const slug of Object.keys(d.downloads)) {
    const idx = d.downloads[slug].findIndex((x) => x.id === dl.id)
    if (idx >= 0) {
      d.downloads[slug][idx] = dl
      saveAppData(d)
      return
    }
  }
}

/** 批量更新下载项的 downloadCount（一次 loadAppData + 一次 saveAppData）
 *  - 用于"刷新下载量"批量回写场景，避免 1410 次 sync localStorage
 *  - 返回实际更新条数 */
export function batchUpdateDownloadCounts(
  updates: Map<string, { count: number; syncedAt: string }>,
): number {
  if (updates.size === 0) return 0
  const d = loadAppData()
  let updated = 0
  for (const slug of Object.keys(d.downloads)) {
    for (const dl of d.downloads[slug]) {
      const u = updates.get(dl.id)
      if (u) {
        dl.downloadCount = u.count
        dl.downloadCountSyncedAt = u.syncedAt
        updated++
      }
    }
  }
  if (updated > 0) saveAppData(d)
  return updated
}

/* ========== 索引 ========== */
export function getIndex(): IndexEntry[] {
  return loadAppData().index
}

export function buildIndex(): IndexEntry[] {
  return getAllSoftware().map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    categorySlug: s.categorySlug,
    description: s.description,
    logo: s.logo,
    featured: s.featured,
    latestVersionId: s.latestVersionId,
    latestUpdateTime: s.latestUpdateTime,
    githubRepo: s.githubRepo,
    githubUrl: s.githubUrl,
    website: s.website,
    stars: s.stars,
    forks: s.forks,
  }))
}

function rebuildIndexInPlace(d: AppData): void {
  d.index = Object.values(d.software).flat().map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    categorySlug: s.categorySlug,
    description: s.description,
    logo: s.logo,
    featured: s.featured,
    latestVersionId: s.latestVersionId,
    latestUpdateTime: s.latestUpdateTime,
    githubRepo: s.githubRepo,
    githubUrl: s.githubUrl,
    website: s.website,
    stars: s.stars,
    forks: s.forks,
  }))
}

/* ========== Category ========== */
export function getCategories(): Category[] {
  return loadAppData().categories
}

export function getCategoryBySlug(slug: string): Category | undefined {
  return getCategories().find((c) => c.slug === slug)
}

export function saveCategory(c: Category): void {
  const d = loadAppData()
  const idx = d.categories.findIndex((x) => x.id === c.id)
  if (idx >= 0) d.categories[idx] = c
  else d.categories.push(c)
  saveAppData(d)
}

export function deleteCategory(id: string): void {
  const d = loadAppData()
  const c = d.categories.find((x) => x.id === id)
  d.categories = d.categories.filter((x) => x.id !== id)
  if (c) {
    delete d.software[c.slug]
    delete d.versions[c.slug]
    delete d.downloads[c.slug]
  }
  rebuildIndexInPlace(d)
  saveAppData(d)
}

/* ========== Settings ========== */
export function getSettings(): Settings {
  return loadAppData().settings
}

export function saveSettings(s: Settings): void {
  const d = loadAppData()
  d.settings = s
  saveAppData(d)
}

/* ========== GitHub 同步 ========== */
export async function syncGitHubProject(software: Software, token?: string): Promise<SyncResult> {
  if (software.sourceType !== 'github' || !software.githubRepo) {
    return { projectId: software.id, projectName: software.name, success: false, error: '非 GitHub 项目' }
  }
  const baseInfo = { projectId: software.id, projectName: software.name, repo: software.githubRepo }
  try {
    /* 限速自动重试：403/429 退避一次（区分 primary/secondary，secondary 等更久） */
    let releases: Awaited<ReturnType<typeof fetchReleases>> = []
    let lastErr: any = null
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        releases = await fetchReleases(software.githubRepo, token)
        break
      } catch (e: any) {
        lastErr = e
        const status = e?.status as number | undefined
        if (status === 401 || status === 404) break
        if (attempt === 1 && (status === 403 || status === 429 || status === undefined)) {
          const wait = Math.min(((e?.retryAfter as number) || 5) * 1000, 10000)
          await new Promise((r) => setTimeout(r, wait))
          continue
        }
        break
      }
    }
    if (!releases.length && lastErr) throw lastErr
    if (!releases.length) {
      return { ...baseInfo, success: false, error: '无 Release' }
    }
    const existingVers = new Set(getSoftwareVersions(software.id).map((v) => v.version))
    let newCount = 0
    let fixedCount = 0
    for (const r of releases) {
      if (!existingVers.has(r.tag_name)) {
        const v = releaseToVersion(r, software.id)
        addVersion(v)
        for (const a of r.assets) {
          const dl: Download = {
            id: uid(),
            versionId: v.id,
            platform: guessPlatform(a.name),
            filename: a.name,
            size: `${(a.size / 1024 / 1024).toFixed(1)} MB`,
            url: a.browser_download_url,
          }
          addDownload(dl)
        }
        newCount++
      } else {
        const existingV = getSoftwareVersions(software.id).find((v) => v.version === r.tag_name)
        if (existingV && getVersionDownloads(existingV.id).length === 0) {
          for (const a of r.assets) {
            const dl: Download = {
              id: uid(),
              versionId: existingV.id,
              platform: guessPlatform(a.name),
              filename: a.name,
              size: `${(a.size / 1024 / 1024).toFixed(1)} MB`,
              url: a.browser_download_url,
            }
            addDownload(dl)
          }
          fixedCount++
        }
      }
    }
    // 更新 stars/forks
    const info = await fetchRepoInfo(software.githubRepo)
    const d = loadAppData()
    const sList = d.software[software.categorySlug] || []
    const sIdx = sList.findIndex((x) => x.id === software.id)
    if (sIdx >= 0) {
      sList[sIdx].stars = info.stars
      sList[sIdx].forks = info.forks
      rebuildIndexInPlace(d)
      saveAppData(d)
    }
    return { ...baseInfo, success: true, newVersions: newCount, fixedVersions: fixedCount }
  } catch (e: any) {
    return { ...baseInfo, success: false, error: e.message, status: e.status }
  }
}

export async function syncAllGitHub(token?: string): Promise<SyncResult[]> {
  const list = getAllSoftware().filter((s) => s.sourceType === 'github')
  /* 并发 2：避免 IP 限速（之前 Promise.all 完全并发，10 个项目同时打 GitHub API 易爆 403） */
  return pMap(list, (s) => syncGitHubProject(s, token), 2)
}

/* ========== 远程数据加载（GitHub Pages JSON） ========== */
const BASE = import.meta.env.BASE_URL || '/'

interface RemoteFile { path: string; data: any }

const REMOTE_INDEX: RemoteFile[] = [
  { path: 'data/index.json', data: null },
  { path: 'data/categories.json', data: null },
  { path: 'data/settings.json', data: null },
  { path: 'data/iconAssets.json', data: null },
  { path: 'data/backup-manifest.json', data: null },
]

const FETCH_TIMEOUT_MS = 8000

async function fetchJSON<T>(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<T | null> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctl.signal })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** 从公共 JSON 加载数据到 localStorage
 *  - 加载全局 index/categories/settings/iconAssets/backup-manifest
 *  - 遍历 categories，对每个 slug 加载 page/{slug}/{software,versions,downloads}.json
 *  - 生产环境：总是覆盖（保证构建后的 JSON 是最新源）
 *  - 开发环境：仅当 localStorage 为空时填充（保留 admin 中未发布的编辑）
 */
export async function loadRemoteData(): Promise<boolean> {
  const d = loadAppData()
  const isEmpty =
    d.software === undefined ||
    Object.keys(d.software).length === 0 ||
    (Object.values(d.software).every((arr) => arr.length === 0) && d.categories.length === 0)

  // 先拉远端 manifest（轻量，只 1 个文件）
  const remoteManifest = await fetchJSON<{ entries: any[]; updatedAt: string }>(
    `${BASE}data/backup-manifest.json`,
  )
  const remoteTime = remoteManifest?.updatedAt
  const localTime = d.backupManifest?.updatedAt

  // 远端 manifest 拉不到（CORS / 404 / 离线）→ 不覆盖本地，避免清空用户数据
  if (!remoteTime) return false

  // 开发环境 + 本地有数据 → 跳过远程同步
  if (!import.meta.env.PROD && !isEmpty) return false

  // 新设备初始化：拉所有数据
  if (isEmpty) {
    await loadAllRemoteData()
    return true
  }

  // 老用户：对比时间戳
  if (localTime && localTime >= remoteTime) {
    return false
  }

  // 远端有更新：覆盖本地
  await loadAllRemoteData()
  return true
}

/** 拉取所有远程数据并写入 localStorage（覆盖模式） */
async function loadAllRemoteData(): Promise<void> {
  const d = loadAppData()

  // 1) 全局文件（5 个并发，秒级返回）
  const [index, categories, settings, iconAssets, backupManifest] = await Promise.all([
    fetchJSON<IndexEntry[]>(`${BASE}data/index.json`),
    fetchJSON<Category[]>(`${BASE}data/categories.json`),
    fetchJSON<Settings>(`${BASE}data/settings.json`),
    fetchJSON<IconAsset[]>(`${BASE}data/iconAssets.json`),
    fetchJSON<{ entries: any[]; updatedAt: string }>(`${BASE}data/backup-manifest.json`),
  ])
  if (index) d.index = index
  if (categories) d.categories = categories
  if (settings) d.settings = { ...DEFAULT_SETTINGS, ...settings }
  if (iconAssets) d.iconAssets = iconAssets
  if (backupManifest) d.backupManifest = backupManifest

  // 2) 每个分类：3 文件并发拉取，所有分类间也并行（pMap 限 4 并发，避免 429）
  const cats = d.categories.length ? d.categories : []
  await pMap(cats, async (c) => {
    const [software, versions, downloads] = await Promise.all([
      fetchJSON<Software[]>(`${BASE}page/${c.slug}/software.json`),
      fetchJSON<Version[]>(`${BASE}page/${c.slug}/versions.json`),
      fetchJSON<Download[]>(`${BASE}page/${c.slug}/downloads.json`),
    ])
    if (software) d.software[c.slug] = software
    if (versions) d.versions[c.slug] = versions
    if (downloads) d.downloads[c.slug] = downloads
  }, 4)

  // 3) 按 ID 去重：同一软件出现在多个 slug 下时，保留 categorySlug 非空的那条
  const seenById = new Map<string, string>() // id -> slug
  for (const [slug, swList] of Object.entries(d.software)) {
    for (const sw of swList) {
      const existingSlug = seenById.get(sw.id)
      if (existingSlug === undefined) {
        seenById.set(sw.id, slug)
      } else {
        // 已存在：优先保留 categorySlug 非空的
        const existingList = d.software[existingSlug]
        const existing = existingList?.find((s) => s.id === sw.id)
        if (existing && !existing.categorySlug && sw.categorySlug) {
          // 当前这条有分类，移除旧的空分类条目
          d.software[existingSlug] = existingList.filter((s) => s.id !== sw.id)
          if (!d.software[existingSlug].length) delete d.software[existingSlug]
          seenById.set(sw.id, slug)
        } else {
          // 移除重复的当前条目
          d.software[slug] = swList.filter((s) => s.id !== sw.id)
          if (!d.software[slug].length) delete d.software[slug]
        }
      }
    }
  }

  saveAppData(d)
}

/* ========== 数据导入导出（管理端） ========== */
export function exportAppData(): string {
  return JSON.stringify(loadAppData(), null, 2)
}

export function importAppData(json: string): boolean {
  try {
    const d = JSON.parse(json)
    if (!d.software || !d.versions || !d.downloads) return false
    saveAppData(d)
    return true
  } catch {
    return false
  }
}

export function resetAppData(): void {
  localStorage.removeItem(KEY)
}

/* ========== GitHub Release 链接导入 ========== */

export interface ParsedReleaseUrl {
  owner: string
  repo: string
  tag: string
}

/** 解析 GitHub Release URL，提取 owner/repo/tag。
 *  兼容尾部 /、query 参数、tag 含 . 或数字。 */
export function parseReleaseUrl(url: string): ParsedReleaseUrl | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  const m = trimmed.match(/^https?:\/\/github\.com\/([^/\s?#]+)\/([^/\s?#]+)\/releases\/tag\/(.+?)\/?$/i)
  if (!m) return null
  return { owner: m[1], repo: m[2], tag: decodeURIComponent(m[3]) }
}

export interface ImportedRelease {
  version: string
  publishedAt: string
  changelog: string
  downloads: { filename: string; url: string; size: string; platform: Platform }[]
}

/** 从 GitHub Release 链接导入版本信息。
 *  支持任意 owner/repo（含 fork），不限当前 software.githubRepo。 */
export async function importReleaseFromUrl(url: string, token?: string): Promise<ImportedRelease> {
  const parsed = parseReleaseUrl(url)
  if (!parsed) {
    throw new Error('链接格式无效，应为 https://github.com/owner/repo/releases/tag/版本号')
  }
  const release = await fetchReleaseByTag(parsed.owner, parsed.repo, parsed.tag, token)
  return {
    version: release.tag_name,
    publishedAt: release.published_at,
    changelog: release.body || '该版本未提供更新日志。',
    downloads: (release.assets || []).map((a) => ({
      filename: a.name,
      url: a.browser_download_url,
      size: formatBytes(a.size),
      platform: guessPlatform(a.name),
    })),
  }
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  const k = 1024
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(k)))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + units[i]
}

/* ========== 真实下载量（仅 GitHub Release 来源） ========== */

/** 解析 GitHub asset URL，提取 owner/repo/tag/filename。
 *  格式：https://github.com/{owner}/{repo}/releases/download/{tag}/{filename} */
export function parseGithubAssetUrl(url: string): { owner: string; repo: string; tag: string; filename: string } | null {
  const m = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/releases\/download\/(.+?)\/(.+)$/i)
  if (!m) return null
  return {
    owner: m[1],
    repo: m[2],
    tag: decodeURIComponent(m[3]),
    filename: decodeURIComponent(m[4]),
  }
}

/** 累加一个软件下所有 downloadCount 真实下载量。
 *  返回 null = 该软件没有任何 GitHub 资产被同步过真实数据。*/
export function realDownloads(s: Software): number | null {
  const cached = _realDLCache.get(s.id)
  if (cached !== undefined) return cached
  const vers = getSoftwareVersions(s.id)
  let total = 0
  let hasAny = false
  for (const v of vers) {
    for (const dl of getVersionDownloads(v.id)) {
      if (dl.downloadCount != null) {
        total += dl.downloadCount
        hasAny = true
      }
    }
  }
  const result = hasAny ? total : null
  _realDLCache.set(s.id, result)
  return result
}

/** 真实下载量 → 显示字符串（缺数据返回 "—"）*/
export function fmtRealDownloads(s: Software): string {
  const v = realDownloads(s)
  if (v == null) return '—'
  return fmtCompact(v)
}

/** 从一组下载项里按 GitHub Release API 拉取真实 download_count。
 *  - 按 owner/repo/tag 分组合并：同一 release 的所有 asset 只调一次 API
 *  - 4 并发拉取，避免浏览器同源连接排队卡死
 *  - 非 GitHub URL 直接跳过
 *  - 限速/404/超时 静默失败（让下载项保留 downloadCount=undefined，前台显示 —）
 *  - onProgress 每完成一个 group 调用一次，用于实时进度展示 */
export async function enrichDownloadCounts(
  downloads: Download[],
  token?: string,
  onProgress?: (p: EnrichProgress) => void,
): Promise<Map<string, { count: number; syncedAt: string }>> {
  const groups = new Map<string, { owner: string; repo: string; tag: string }>()
  for (const dl of downloads) {
    const p = parseGithubAssetUrl(dl.url)
    if (!p) continue
    const key = `${p.owner}/${p.repo}/${p.tag}`
    if (!groups.has(key)) groups.set(key, p)
  }

  const total = groups.size
  let done = 0
  let ok = 0
  let rateLimited = 0
  let errored = 0
  let retried = 0
  const errors: EnrichError[] = []

  const emit = (currentGroup: string, status: 'ok' | 'rate-limit' | 'retry' | 'error') => {
    onProgress?.({ done, total, currentGroup, status, ok, rateLimited, errored, retried, errors })
  }

  const cache = new Map<string, Map<string, number>>()
  const groupList = Array.from(groups.values())
  await pMap(groupList, async (g) => {
    const key = `${g.owner}/${g.repo}/${g.tag}`
    const recordError = (status: number | undefined, message: string) => {
      errors.push({
        group: key,
        url: `https://github.com/${g.owner}/${g.repo}/releases/tag/${g.tag}`,
        status,
        message,
      })
    }
    let release: GitHubRelease | null = null
    let lastErr: any = null
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        release = await fetchReleaseByTag(g.owner, g.repo, g.tag, token)
        break
      } catch (e: any) {
        lastErr = e
        const status = e?.status as number | undefined
        if (status === 401 || status === 404) break
        if (attempt === 1 && (status === 403 || status === 429 || status === undefined)) {
          retried++
          emit(key, 'retry')
          const wait = Math.min(((e?.retryAfter as number) || 5) * 1000, 10000)
          await new Promise((r) => setTimeout(r, wait))
          continue
        }
        break
      }
    }
    if (release) {
      const map = new Map<string, number>()
      for (const a of release.assets || []) map.set(a.name, a.download_count ?? 0)
      cache.set(key, map)
      ok++
      emit(key, 'ok')
    } else {
      const status = lastErr?.status as number | undefined
      const message = String(lastErr?.message || '未知错误')
      if (status === 403 || status === 429) {
        rateLimited++
        recordError(status, message)
        emit(key, 'rate-limit')
      } else {
        errored++
        recordError(status, message)
        emit(key, 'error')
      }
    }
    done++
  }, 2)

  const syncedAt = new Date().toISOString()
  const result = new Map<string, { count: number; syncedAt: string }>()
  for (const dl of downloads) {
    const p = parseGithubAssetUrl(dl.url)
    if (!p) continue
    const m = cache.get(`${p.owner}/${p.repo}/${p.tag}`)
    if (!m) continue
    const count = m.get(p.filename)
    if (count != null) result.set(dl.id, { count, syncedAt })
  }
  return result
}
