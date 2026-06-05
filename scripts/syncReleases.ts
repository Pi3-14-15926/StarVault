/**
 * GitHub Release 同步脚本
 * 读取 projects.json，遍历所有 GitHub 项目，调用 GitHub API 同步 Release
 * 用法: npx tsx scripts/syncReleases.ts
 */
import fs from 'node:fs'
import path from 'node:path'

interface GitHubAsset {
  name: string
  size: number
  browser_download_url: string
  content_type: string
}

interface GitHubRelease {
  tag_name: string
  published_at: string
  body: string
  assets: GitHubAsset[]
}

interface Download {
  platform: string
  filename: string
  size: string
  url: string
}

interface Version {
  id: string
  version: string
  publishedAt: string
  changelog: string
  downloads: Download[]
}

interface Project {
  id: string
  slug: string
  sourceType: 'github' | 'custom'
  name: string
  description: string
  logo: string
  categoryId: string
  featured: boolean
  githubRepo?: string
  githubUrl?: string
  website?: string
  stars?: number
  forks?: number
  latestVersion: string
  latestUpdateTime: string
  versions: Version[]
}

// 数据文件路径（以 public/data 为准，与发布到仓库保持一致）
const DATA_DIR = path.resolve(process.cwd(), 'public/data')
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json')

const GITHUB_API = 'https://api.github.com'
const TOKEN = process.env.GH_TOKEN || ''

/** 生成 ID */
function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/** 获取 GitHub Release */
async function fetchReleases(repo: string): Promise<GitHubRelease[]> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' }
  if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`
  const res = await fetch(`${GITHUB_API}/repos/${repo}/releases?per_page=20`, { headers })
  if (!res.ok) throw new Error(`GitHub API error ${res.status}: ${res.statusText}`)
  return res.json()
}

/** 获取仓库信息 */
async function fetchRepoInfo(repo: string): Promise<{ stars: number; forks: number }> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' }
  if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`
  const res = await fetch(`${GITHUB_API}/repos/${repo}`, { headers })
  if (!res.ok) return { stars: 0, forks: 0 }
  const data = await res.json()
  return { stars: data.stargazers_count ?? 0, forks: data.forks_count ?? 0 }
}

/** 获取系统类型 */
function guessPlatform(name: string): string {
  const lower = name.toLowerCase()
  if (lower.includes('android') || lower.includes('apk')) return 'Android'
  if (lower.includes('windows') || lower.includes('exe') || lower.includes('msi')) return 'Windows'
  if (lower.includes('macos') || lower.includes('darwin') || lower.includes('dmg')) return 'MacOS'
  if (lower.includes('linux') || lower.includes('deb') || lower.includes('appimage')) return 'Linux'
  return 'Other'
}

/** 同步主函数 */
async function main() {
  console.log('=== GitHub Release 同步脚本 ===')
  console.log(`数据目录: ${DATA_DIR}`)

  // 读取 projects.json
  if (!fs.existsSync(PROJECTS_FILE)) {
    console.log('projects.json 不存在，创建空文件')
    fs.writeFileSync(PROJECTS_FILE, '[]', 'utf-8')
    return
  }

  const raw = fs.readFileSync(PROJECTS_FILE, 'utf-8')
  const projects: Project[] = JSON.parse(raw)
  const githubProjects = projects.filter((p) => p.sourceType === 'github' && p.githubRepo)

  console.log(`共 ${projects.length} 个项目，其中 ${githubProjects.length} 个 GitHub 项目`)

  let successCount = 0
  let failCount = 0

  for (const project of githubProjects) {
    console.log(`\n同步: ${project.name} (${project.githubRepo})`)
    try {
      // 获取 Release
      const releases = await fetchReleases(project.githubRepo!)
      console.log(`  获取到 ${releases.length} 个 Release`)

      // 记录已有版本号
      const existingVers = new Set(project.versions.map((v) => v.version))
      let newCount = 0

      for (const r of releases) {
        if (!existingVers.has(r.tag_name)) {
          const v: Version = {
            id: uid(),
            version: r.tag_name,
            publishedAt: r.published_at,
            changelog: r.body || '该版本未提供更新日志。',
            downloads: r.assets.map((a) => ({
              platform: guessPlatform(a.name),
              filename: a.name,
              size: `${(a.size / 1024 / 1024).toFixed(1)} MB`,
              url: a.browser_download_url,
            })),
          }
          project.versions.push(v)
          newCount++
        }
      }

      // 按发布时间降序
      project.versions.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())

      // 更新最新版本
      if (project.versions.length > 0) {
        project.latestVersion = project.versions[0].version
        project.latestUpdateTime = project.versions[0].publishedAt
      }

      // 更新 Star / Fork
      const info = await fetchRepoInfo(project.githubRepo!)
      project.stars = info.stars
      project.forks = info.forks

      console.log(`  新增 ${newCount} 个版本，当前共 ${project.versions.length} 个版本`)
      successCount++
    } catch (e: any) {
      console.error(`  同步失败: ${e.message}`)
      failCount++
    }
  }

  // 写回文件
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2), 'utf-8')
  console.log(`\n=== 同步完成: 成功 ${successCount}, 失败 ${failCount} ===`)
}

main().catch(console.error)
