/** GitHub Token 认证管理 */

const TOKEN_KEY = 'sh_admin_token'
const USER_KEY = 'sh_admin_user'

export interface GitHubUser {
  login: string
  id: number
  avatar_url: string
  name: string | null
}

/** 保存 Token 到 localStorage（持久化，刷新/新 tab 都在） */
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

/** 获取保存的 Token */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

/** 清除 Token */
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

/** 保存用户信息 */
function setUser(user: GitHubUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

/** 获取已认证用户信息 */
export function getCurrentUser(): GitHubUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/** 是否已登录 */
export function isAuthenticated(): boolean {
  return !!getToken()
}

/** 用 GitHub API 验证 Token 有效性 + 检查所需 scope */
export async function validateToken(token: string): Promise<GitHubUser> {
  const res = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (!res.ok) {
    if (res.status === 401) throw new Error('Token 无效或已过期')
    if (res.status === 403) throw new Error('API 频率限制，请稍后重试')
    throw new Error(`验证失败 (HTTP ${res.status})`)
  }
  const user: GitHubUser = await res.json()

  // 检查 Token 是否有 repo scope（写操作必需）
  // ⚠️ 强烈建议使用 Fine-grained PAT：Contents: Read & Write（仅限目标仓库）
  // Fine-grained PAT 不返回 x-oauth-scopes 头，所以这里只对 classic PAT 做警告
  const scopes = res.headers.get('x-oauth-scopes') || ''
  if (scopes && !scopes.includes('repo') && !scopes.includes('public_repo')) {
    console.warn(
      '[auth] Token 缺少 repo/public_repo scope，写操作可能失败。当前的 scopes:',
      scopes,
    )
  }
  return user
}

/** 登录成功：保存 token 和用户信息 */
export function saveLogin(token: string, user: GitHubUser): void {
  setToken(token)
  setUser(user)
}
