/** GitHub API 工具 */
import type { GitHubRelease, Version, Platform } from '../types'
import { uid } from './index'

const GITHUB_API = 'https://api.github.com'
const FETCH_TIMEOUT = 15000

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT)
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal })
    return res
  } finally {
    clearTimeout(timer)
  }
}

function ghError(message: string, status: number, retryAfter?: number): Error {
  const e: any = new Error(message)
  e.status = status
  e.retryAfter = retryAfter
  return e
}

/** 清洗 repo 字符串：去掉协议、域名、前后斜杠、空白 */
function normalizeRepo(repo: string): string {
  return repo
    .trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/^github\.com\//i, '')
    .replace(/^\/+|\/+$/g, '')
}

/** 从 GitHub Release API 获取版本列表 */
export async function fetchReleases(repo: string, token?: string): Promise<GitHubRelease[]> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const cleanRepo = normalizeRepo(repo)
  const res = await fetchWithTimeout(`${GITHUB_API}/repos/${cleanRepo}/releases?per_page=20`, { headers })
  if (res.ok) return res.json()
  const retryAfter = Number(res.headers.get('retry-after') || 0) || undefined
  const remaining = res.headers.get('x-ratelimit-remaining')
  const reset = res.headers.get('x-ratelimit-reset')
  const tokenNote = token ? '' : '（未登录，匿名请求 60/h，极易触发限速）'
  if (res.status === 404) throw ghError(`仓库 ${cleanRepo} 不存在、为私有或无访问权限`, 404, undefined)
  if (res.status === 401) throw ghError('Token 无效或已过期，请重新登录', 401, undefined)
  if (res.status === 403) {
    const isPrimary = remaining === '0'
    const resetAt = reset ? new Date(Number(reset) * 1000).toISOString().slice(11, 19) : '?'
    if (isPrimary) {
      throw ghError(`GitHub API 主限速 (403)，reset @ ${resetAt} UTC${tokenNote}`, 403, retryAfter)
    }
    throw ghError(`GitHub API 次级限速/禁止 (403)：IP 滥用检测或请求过快${tokenNote ? '，建议登录使用 token' : ''}`, 403, retryAfter)
  }
  if (res.status === 429) {
    const wait = retryAfter ? `${retryAfter}s` : '未知'
    throw ghError(`GitHub API 限速 (429)，请 ${wait} 后重试${tokenNote}`, 429, retryAfter)
  }
  throw ghError(`GitHub API 错误: ${res.status} ${res.statusText}`, res.status, retryAfter)
}

/** 从 GitHub Release API 获取单个 release（按 owner/repo/tag）
 *  错误对象会带 status 和 retryAfter 字段，供调用方决定是否重试 */
export async function fetchReleaseByTag(
  owner: string,
  repo: string,
  tag: string,
  token?: string,
): Promise<GitHubRelease> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetchWithTimeout(
    `${GITHUB_API}/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`,
    { headers },
  )
  if (res.ok) return res.json()
  const retryAfter = Number(res.headers.get('retry-after') || 0) || undefined
  if (res.status === 404) throw ghError('Release 不存在或仓库为私有/已删除', 404)
  if (res.status === 401) throw ghError('Token 无效或已过期，请重新登录', 401)
  if (res.status === 403 || res.status === 429) {
    throw ghError(`GitHub API 限速 (HTTP ${res.status})`, res.status, retryAfter)
  }
  throw ghError(`GitHub API 错误: ${res.status} ${res.statusText}`, res.status, retryAfter)
}

/** 将 GitHub Release 转换为内部 Version（downloads 独立为 Download 实体，调用方负责 addDownload） */
export function releaseToVersion(release: GitHubRelease, projectId: string): Version {
  return {
    id: uid(),
    projectId,
    version: release.tag_name,
    publishedAt: release.published_at,
    changelog: release.body || '该版本未提供更新日志。',
    downloadIds: [],
  }
}

/** 根据文件名猜测平台 */
export function guessPlatform(name: string): Platform {
  const lower = name.toLowerCase()
  if (lower.includes('android') || lower.includes('apk')) return 'Android'
  if (lower.includes('ios') || lower.includes('ipa')) return 'iOS'
  if (lower.includes('windows') || lower.includes('win') || lower.includes('exe') || lower.includes('msi')) return 'Windows'
  if (lower.includes('macos') || lower.includes('darwin') || lower.includes('dmg') || lower.includes('mac')) return 'MacOS'
  if (lower.includes('linux') || lower.includes('deb') || lower.includes('appimage') || lower.includes('rpm')) return 'Linux'
  if (lower.includes('web') || lower.endsWith('.html') || lower.endsWith('.js')) return 'Web'
  return 'Other'
}

/** 推断软件支持的平台列表（基于所有下载项） */
export function inferPlatforms(downloads: { platform: Platform }[]): Platform[] {
  const set = new Set(downloads.map((d) => d.platform))
  return Array.from(set)
}

/** 从 GitHub API 获取仓库信息（Star/Fork 数） */
export async function fetchRepoInfo(repo: string): Promise<{ stars: number; forks: number }> {
  try {
    const cleanRepo = normalizeRepo(repo)
    const res = await fetchWithTimeout(`${GITHUB_API}/repos/${cleanRepo}`)
    if (!res.ok) return { stars: 0, forks: 0 }
    const data = await res.json()
    return { stars: data.stargazers_count ?? 0, forks: data.forks_count ?? 0 }
  } catch {
    console.warn('fetchRepoInfo 失败:', repo)
    return { stars: 0, forks: 0 }
  }
}

/** 仓库详细信息（用于自动填充表单） */
export interface RepoDetail {
  name: string
  full_name: string
  description: string
  html_url: string
  owner: { login: string; avatar_url: string }
  topics: string[]
  language: string | null
  stargazers_count: number
  forks_count: number
  default_branch: string
}

/** 从 GitHub API 获取仓库详细信息 */
export async function fetchRepoDetail(repo: string): Promise<RepoDetail> {
  const res = await fetchWithTimeout(`${GITHUB_API}/repos/${repo}`)
  if (!res.ok) throw new Error(`获取仓库信息失败 (${res.status})`)
  return res.json()
}
