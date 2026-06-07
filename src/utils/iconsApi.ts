/** 客户端直接调用 GitHub Contents API
 *  - 复用 githubRepo.ts 的 getRepoInfo() / getToken()
 *  - 上传 / 列表 / 删除 都走 https://api.github.com
 *  - 上传到独立分支（如 image），通过 jsDelivr 从该分支拉取，无需触发部署
 *  - 首传前若分支不存在，自动从 main 创建
 */
import { getToken } from './auth'
import { getRepoInfo } from './githubRepo'

const API_BASE = 'https://api.github.com'
const RAW_BASE = 'https://raw.githubusercontent.com'

function authHeaders(): Record<string, string> {
  const token = getToken()
  const h: Record<string, string> = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

async function gh<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers as Record<string, string> || {}) },
  })
  const text = await res.text()
  let data: any = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!res.ok) {
    const msg = (data && (data.message || data.error)) || `HTTP ${res.status}`
    throw new Error(msg)
  }
  return data as T
}

export interface IconConfigPublic {
  branch: string
  path: string
}

export interface IconListItem {
  name: string
  path: string
  sha: string
  size: number
  rawUrl: string
  downloadUrl: string | null
  htmlUrl: string
  uploadedAt?: string
}

export interface UploadResult {
  name: string
  path: string
  sha: string
  size: number
  rawUrl: string
  cdnUrl: string
  commitUrl: string
  overwritten: boolean
  branchCreated: boolean
}

/* =================== 分支管理 =================== */

export interface BranchStatus {
  exists: boolean
  branch: string
  defaultBranch: string
  repoAccessible: boolean
  tokenValid: boolean
  login?: string
  error?: string
}

/** 检查分支是否存在 */
async function branchExists(branch: string): Promise<boolean> {
  const { owner, repo } = getRepoInfo()
  try {
    await gh(`/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`)
    return true
  } catch {
    return false
  }
}

/** 创建一个新分支（从 defaultBranch 拉取） */
async function createBranch(branch: string, fromBranch: string): Promise<void> {
  const { owner, repo } = getRepoInfo()
  // 1. 取源分支最新 commit sha
  const refData = await gh<{ object: { sha: string } }>(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(fromBranch)}`)
  const sha = refData.object.sha
  // 2. 创建新分支
  await gh(`/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ref: `refs/heads/${branch}`,
      sha,
    }),
  })
}

/* =================== 配置（硬编码默认） =================== */

export const ICON_BRANCH = 'image'
export const ICON_PATH = 'public/icons'

/* =================== 测试连接 =================== */

export async function testIconConfig(): Promise<BranchStatus> {
  const { owner, repo } = getRepoInfo()
  const result: BranchStatus = {
    exists: false,
    branch: ICON_BRANCH,
    defaultBranch: 'main',
    repoAccessible: false,
    tokenValid: false,
  }
  try {
    // 1. 取仓库信息（验证 token + 拿到 default branch）
    const repoData = await gh<{ default_branch: string }>(`/repos/${owner}/${repo}`)
    result.repoAccessible = true
    result.tokenValid = true
    result.defaultBranch = repoData.default_branch

    // 2. 验证 token（拉取 user）
    try {
      const me = await gh<{ login: string }>(`/user`)
      result.login = me.login
    } catch {
      result.tokenValid = false
    }

    // 3. 检查分支
    result.exists = await branchExists(ICON_BRANCH)
    return result
  } catch (e: any) {
    result.error = e.message
    return result
  }
}

/** 创建分支（首传前调用） */
export async function ensureBranch(branch?: string, fromBranch = 'main'): Promise<{ created: boolean; branch: string }> {
  const target = branch || ICON_BRANCH
  if (await branchExists(target)) return { created: false, branch: target }
  await createBranch(target, fromBranch)
  return { created: true, branch: target }
}

/* =================== 列表 =================== */

export async function listIcons(): Promise<{ items: IconListItem[]; error?: string }> {
  const { owner, repo } = getRepoInfo()
  try {
    // 先确认分支存在
    if (!(await branchExists(ICON_BRANCH))) {
      return { items: [] }
    }
    const data = await gh<any[]>(`/repos/${owner}/${repo}/contents/${encodeURIComponent(ICON_PATH)}?ref=${encodeURIComponent(ICON_BRANCH)}`)
    if (!Array.isArray(data)) return { items: [] }
    const items: IconListItem[] = data
      .filter((i) => i.type === 'file' && /\.(png|jpe?g|webp|gif|svg)$/i.test(i.name))
      .map((i) => ({
        name: i.name,
        path: i.path,
        sha: i.sha,
        size: i.size,
        rawUrl: `${RAW_BASE}/${owner}/${repo}/${ICON_BRANCH}/${i.path}`,
        downloadUrl: i.download_url,
        htmlUrl: i.html_url,
      }))

    // 拉取每个文件的最后 commit 时间（N+1，但 pMap 4 并发，~50 文件约 2-3s）
    await enrichUploadDates(items)
    return { items }
  } catch (e: any) {
    return { items: [], error: e.message }
  }
}

async function pMapIcons<T, R>(
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

async function enrichUploadDates(items: IconListItem[]): Promise<void> {
  const { owner, repo } = getRepoInfo()
  await pMapIcons(items, async (item) => {
    try {
      const commits = await gh<Array<{ commit?: { committer?: { date?: string } } }>>(
        `/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(ICON_BRANCH)}&path=${encodeURIComponent(item.path)}&per_page=1`,
      )
      const date = commits[0]?.commit?.committer?.date
      if (date) item.uploadedAt = date
    } catch { /* 静默：拿不到时间的图标仍可显示，仅不参与日期排序 */ }
  })
}

/* =================== 上传 =================== */

export async function uploadIcon(filename: string, contentBase64: string): Promise<UploadResult> {
  const { owner, repo } = getRepoInfo()
  const token = getToken()
  if (!token) throw new Error('请先登录后台（需要 GitHub Token）')

  // 自动创建分支（如果不存在）
  let branchCreated = false
  if (!(await branchExists(ICON_BRANCH))) {
    const repoData = await gh<{ default_branch: string }>(`/repos/${owner}/${repo}`)
    await createBranch(ICON_BRANCH, repoData.default_branch)
    branchCreated = true
  }

  const safeName = filename
    .replace(/[\/\\\x00-\x1f]/g, '_')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 80) || 'icon'
  const fullPath = `${ICON_PATH.replace(/^\/+|\/+$/, '')}/${safeName}`

  // 查 sha（如果存在）
  let existingSha: string | undefined
  try {
    const exist = await gh<{ sha: string }>(`/repos/${owner}/${repo}/contents/${encodeURIComponent(fullPath)}?ref=${encodeURIComponent(ICON_BRANCH)}`)
    existingSha = exist.sha
  } catch { /* 404 = new file */ }

  // PUT 提交
  const putRes = await gh<{ content: { name: string; path: string; sha: string; size: number }; commit: { html_url: string } }>(
    `/repos/${owner}/${repo}/contents/${encodeURIComponent(fullPath)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: existingSha
          ? `chore(icons): update ${safeName} via SoftwareHub`
          : `chore(icons): add ${safeName} via SoftwareHub`,
        content: contentBase64,
        branch: ICON_BRANCH,
        sha: existingSha,
      }),
    },
  )

  const rawUrl = `${RAW_BASE}/${owner}/${repo}/${ICON_BRANCH}/${putRes.content.path}`
  // 默认 CDN URL：调用方传入 mode 拼装，这里只给 rawUrl，由 ui 层拼
  return {
    name: putRes.content.name,
    path: putRes.content.path,
    sha: putRes.content.sha,
    size: putRes.content.size,
    rawUrl,
    cdnUrl: rawUrl,  // 占位，实际 CDN URL 在 UI 算
    commitUrl: putRes.commit.html_url,
    overwritten: !!existingSha,
    branchCreated,
  }
}

/* =================== 删除 =================== */

export async function deleteIcon(path: string, sha: string): Promise<{ success: boolean; refreshed?: boolean }> {
  const { owner, repo } = getRepoInfo()
  const token = getToken()
  if (!token) throw new Error('请先登录后台（需要 GitHub Token）')

  const doDelete = (s: string) => gh(
    `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `chore(icons): remove ${path.split('/').pop()} via SoftwareHub`,
        sha: s,
        branch: ICON_BRANCH,
      }),
    },
  )

  try {
    await doDelete(sha)
    return { success: true }
  } catch (e: any) {
    const msg = String(e?.message || '')
    const shaStale = /404|409|not found|conflict/i.test(msg)
    if (!shaStale) throw e
    try {
      const fresh = await gh<{ sha: string }>(
        `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ICON_BRANCH)}`,
      )
      await doDelete(fresh.sha)
      return { success: true, refreshed: true }
    } catch (e2: any) {
      const msg2 = String(e2?.message || '')
      if (/404|not found/i.test(msg2)) {
        throw new Error('文件已不存在（请刷新图标库）')
      }
      throw e2
    }
  }
}

/* =================== 重命名 =================== */

/** 重命名图标的限制（防止破坏路径或覆盖同名） */
export interface RenameResult {
  oldName: string
  newName: string
  newPath: string
  newCdnUrl: string
  commitUrl: string
  overwritten: boolean
}

/** 校验新文件名：保留扩展名、不能含 / 或 ..、不能与旧名相同 */
export function validateIconRename(oldName: string, newName: string): { valid: boolean; error?: string; finalName?: string } {
  const trimmed = newName.trim()
  if (!trimmed) return { valid: false, error: '文件名不能为空' }
  if (trimmed.includes('/') || trimmed.includes('\\')) return { valid: false, error: '文件名不能包含 / 或 \\' }
  if (trimmed.includes('..')) return { valid: false, error: '文件名不能包含 ..' }
  if (trimmed === oldName) return { valid: false, error: '新文件名与旧文件名相同' }
  const oldExt = oldName.split('.').pop()?.toLowerCase() || ''
  const newExt = trimmed.split('.').pop()?.toLowerCase() || ''
  if (oldExt !== newExt) return { valid: false, error: `扩展名必须保持为 .${oldExt}` }
  return { valid: true, finalName: trimmed }
}

/** GitHub Contents API 不支持原子 rename，分两步：PUT 新 + DELETE 旧 */
export async function renameIcon(
  item: IconListItem,
  newName: string,
): Promise<RenameResult> {
  const token = getToken()
  if (!token) throw new Error('请先登录后台（需要 GitHub Token）')

  const v = validateIconRename(item.name, newName)
  if (!v.valid || !v.finalName) throw new Error(v.error || '文件名无效')

  const { owner, repo } = getRepoInfo()
  const finalName = v.finalName
  const dir = ICON_PATH.replace(/^\/+|\/+$/, '')
  const newPath = `${dir}/${finalName}`

  if (newPath === item.path) throw new Error('新旧路径相同')

  // 1. 拉旧文件的 base64 内容
  const oldFile = await gh<{ content: string; sha: string }>(
    `/repos/${owner}/${repo}/contents/${encodeURIComponent(item.path)}?ref=${encodeURIComponent(ICON_BRANCH)}`,
  )

  // 2. 检查新名是否已存在（决定是否走覆盖）
  let existingSha: string | undefined
  try {
    const exist = await gh<{ sha: string }>(
      `/repos/${owner}/${repo}/contents/${encodeURIComponent(newPath)}?ref=${encodeURIComponent(ICON_BRANCH)}`,
    )
    existingSha = exist.sha
  } catch { /* 404 = 新文件 */ }

  // 3. PUT 新文件
  const putRes = await gh<{ commit: { html_url: string }; content: { path: string } }>(
    `/repos/${owner}/${repo}/contents/${encodeURIComponent(newPath)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: existingSha
          ? `chore(icons): rename ${item.name} → ${finalName} (overwrite) via SoftwareHub`
          : `chore(icons): rename ${item.name} → ${finalName} via SoftwareHub`,
        content: oldFile.content,
        branch: ICON_BRANCH,
        sha: existingSha,
      }),
    },
  )

  // 4. DELETE 旧文件
  await gh(
    `/repos/${owner}/${repo}/contents/${encodeURIComponent(item.path)}`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `chore(icons): remove old name ${item.name} after rename via SoftwareHub`,
        sha: item.sha,
        branch: ICON_BRANCH,
      }),
    },
  )

  const newCdnUrl = `${RAW_BASE}/${owner}/${repo}/${ICON_BRANCH}/${putRes.content.path}`
  return {
    oldName: item.name,
    newName: finalName,
    newPath: putRes.content.path,
    newCdnUrl,
    commitUrl: putRes.commit.html_url,
    overwritten: !!existingSha,
  }
}
