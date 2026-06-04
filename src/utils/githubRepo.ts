/**
 * 通过 GitHub API 将数据提交回仓库
 * 使用管理员登录时保存的 Token 认证
 */
import type { Project, Category, Settings } from '../types'
import { getProjects, getCategories, getSettings } from './api'
import { getToken } from './auth'

const API_BASE = 'https://api.github.com'

interface RepoInfo {
  owner: string
  repo: string
}

/** 获取仓库信息 */
function getRepoInfo(): RepoInfo {
  if (import.meta.env.PROD) {
    const hostname = window.location.hostname
    const pathname = window.location.pathname
    const owner = hostname.split('.')[0]
    const repo = pathname.split('/')[1]
    return { owner, repo }
  }
  return { owner: 'Pi3-14-15926', repo: 'SoftwareHub' }
}

/** GitHub API 请求头 */
function headers() {
  const token = getToken()
  const h: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

/** 获取文件当前 SHA（用于更新已有文件） */
async function getFileSha(path: string): Promise<string | null> {
  const { owner, repo } = getRepoInfo()
  try {
    const res = await fetch(`${API_BASE}/repos/${owner}/${repo}/contents/${path}`, {
      headers: headers(),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.sha || null
  } catch {
    return null
  }
}

/** 提交单个文件到仓库 */
async function commitFile(path: string, content: string, message: string): Promise<void> {
  const { owner, repo } = getRepoInfo()
  const sha = await getFileSha(path)
  const body: Record<string, any> = {
    message,
    content: btoa(unescape(encodeURIComponent(content))),
    branch: 'main',
  }
  if (sha) body.sha = sha

  const res = await fetch(`${API_BASE}/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }))
    throw new Error(err.message || '提交失败')
  }
}

/** 触发 GitHub Actions 工作流 */
export async function triggerWorkflow(workflow: string): Promise<void> {
  const token = getToken()
  if (!token) throw new Error('未登录，请先登录')
  const { owner, repo } = getRepoInfo()

  const res = await fetch(`${API_BASE}/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ ref: 'main' }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }))
    throw new Error(err.message || '触发失败')
  }
}

/** 触发同步 Release 工作流 */
export async function triggerSync(): Promise<void> {
  await triggerWorkflow('sync.yml')
}

/** 触发同步 + WebDAV 备份工作流 */
export async function triggerSyncBackup(): Promise<void> {
  await triggerWorkflow('sync-backup.yml')
}

/** 将所有数据提交到仓库，触发 GitHub Pages 重新构建 */
export async function commitAllData(): Promise<{ files: number; repo: string }> {
  const token = getToken()
  if (!token) throw new Error('未登录，请先登录')

  const projects = getProjects()
  const categories = getCategories()
  const settings = getSettings()

  if (!projects.length && !categories.length) {
    throw new Error('没有数据可提交')
  }

  const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const message = `chore(data): 发布数据更新 ${timestamp}`

  const files = [
    { path: 'public/data/projects.json', content: JSON.stringify(projects, null, 2) },
    { path: 'public/data/categories.json', content: JSON.stringify(categories, null, 2) },
    { path: 'public/data/settings.json', content: JSON.stringify(settings, null, 2) },
  ]

  for (const file of files) {
    await commitFile(file.path, file.content, message)
  }

  const { owner, repo } = getRepoInfo()
  return { files: files.length, repo: `${owner}/${repo}` }
}
