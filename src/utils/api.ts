/** 模拟 API 层 —— 实际项目中替换为真实 GitHub JSON 文件请求 */
import type { Project, Category, Settings, SyncResult } from '../types'
import { uid } from './index'
import { fetchReleases, releaseToVersion, fetchRepoInfo } from './github'
import { DEFAULT_SETTINGS } from '../defaults'

/* ========== 本地存储键名 ========== */
const KEY_PROJECTS = 'sh_projects'
const KEY_CATEGORIES = 'sh_categories'
const KEY_SETTINGS = 'sh_settings'

/* ========== 读取 / 写入 ========== */
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

/* ========== 远程数据加载 (GitHub Pages) ========== */
const DATA_FILES: Record<string, string> = {
  sh_projects: '/data/projects.json',
  sh_categories: '/data/categories.json',
  sh_settings: '/data/settings.json',
}

async function fetchRemoteJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(DATA_FILES[key])
    if (!res.ok) return fallback
    return await res.json()
  } catch {
    return fallback
  }
}

/** 生产环境下从 GitHub Pages JSON 文件加载数据到 localStorage */
export async function loadRemoteData(): Promise<void> {
  if (!import.meta.env.PROD) return
  const [projects, categories, settings] = await Promise.all([
    fetchRemoteJSON<Project[]>('sh_projects', []),
    fetchRemoteJSON<Category[]>('sh_categories', []),
    fetchRemoteJSON<Settings>('sh_settings', null as any),
  ])
  if (projects.length) saveJSON(KEY_PROJECTS, projects)
  if (categories.length) saveJSON(KEY_CATEGORIES, categories)
  if (settings) saveJSON(KEY_SETTINGS, settings)
}

/* ========== 项目 ========== */
export function getProjects(): Project[] {
  return loadJSON<Project[]>(KEY_PROJECTS, [])
}
export function getProjectBySlug(slug: string): Project | undefined {
  return getProjects().find((p) => p.slug === slug)
}
export function saveProject(p: Project): void {
  const list = getProjects()
  const idx = list.findIndex((x) => x.id === p.id)
  if (idx >= 0) list[idx] = p
  else list.push(p)
  saveJSON(KEY_PROJECTS, list)
}
export function deleteProject(id: string): void {
  const list = getProjects().filter((x) => x.id !== id)
  saveJSON(KEY_PROJECTS, list)
}

/** 同步单个 GitHub 项目 */
export async function syncGitHubProject(project: Project, token?: string): Promise<SyncResult> {
  if (project.sourceType !== 'github' || !project.githubRepo) {
    return { projectId: project.id, success: false, error: '非 GitHub 项目' }
  }
  try {
    const releases = await fetchReleases(project.githubRepo, token)
    if (!releases.length) {
      return { projectId: project.id, success: false, error: '无 Release' }
    }
    // 记录已有版本号
    const existingVers = new Set(project.versions.map((v) => v.version))
    let newCount = 0
    for (const r of releases) {
      if (!existingVers.has(r.tag_name)) {
        project.versions.push(releaseToVersion(r))
        newCount++
      }
    }
    // 按时间降序
    project.versions.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    // 更新最新版本信息
    const latest = project.versions[0]
    if (latest) {
      project.latestVersion = latest.version
      project.latestUpdateTime = latest.publishedAt
    }
    // 更新 Star/Fork
    const info = await fetchRepoInfo(project.githubRepo)
    project.stars = info.stars
    project.forks = info.forks
    saveProject(project)
    return { projectId: project.id, success: true, newVersions: newCount }
  } catch (e: any) {
    return { projectId: project.id, success: false, error: e.message }
  }
}

/** 同步所有 GitHub 项目 */
export async function syncAllGitHub(token?: string): Promise<SyncResult[]> {
  const projects = getProjects().filter((p) => p.sourceType === 'github')
  return Promise.all(projects.map((p) => syncGitHubProject(p, token)))
}

/* ========== 分类 ========== */
export function getCategories(): Category[] {
  return loadJSON<Category[]>(KEY_CATEGORIES, [])
}
export function getCategoryBySlug(slug: string): Category | undefined {
  return getCategories().find((c) => c.slug === slug)
}
export function saveCategory(c: Category): void {
  const list = getCategories()
  const idx = list.findIndex((x) => x.id === c.id)
  if (idx >= 0) list[idx] = c
  else list.push(c)
  saveJSON(KEY_CATEGORIES, list)
}
export function deleteCategory(id: string): void {
  const list = getCategories().filter((x) => x.id !== id)
  saveJSON(KEY_CATEGORIES, list)
}

/* ========== 设置 ========== */
export function getSettings(): Settings {
  return loadJSON<Settings>(KEY_SETTINGS, DEFAULT_SETTINGS)
}
export function saveSettings(s: Settings): void {
  saveJSON(KEY_SETTINGS, s)
}
