/**
 * GitHub Actions 定时同步 + WebDAV 备份脚本
 *
 * 环境变量 (通过 GitHub Secrets 设置):
 *   GH_TOKEN          — GitHub 个人访问令牌 (可选，提高 API 限流)
 *   WEBDAV_URL        — WebDAV 服务器地址
 *   WEBDAV_USERNAME   — WebDAV 用户名
 *   WEBDAV_PASSWORD   — WebDAV 密码
 *   WEBDAV_BASE_DIR   — WebDAV 根目录 (默认 /SoftwareHub)
 *   GH_PROXY          — GitHub 下载加速代理 (可选)
 *   KEEP_VERSIONS     — 每个项目保留的版本数 (默认 2)
 */

import fs from 'fs'
import path from 'path'
import { createClient } from 'webdav'
import { execSync } from 'child_process'

const DATA_DIR = path.resolve('public/data')
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json')
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json')
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json')

const GITHUB_API = 'https://api.github.com'

const GH_TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || ''
const WEBDAV_URL = process.env.WEBDAV_URL || ''
const WEBDAV_USERNAME = process.env.WEBDAV_USERNAME || ''
const WEBDAV_PASSWORD = process.env.WEBDAV_PASSWORD || ''
const WEBDAV_BASE_DIR = (process.env.WEBDAV_BASE_DIR || '/SoftwareHub').replace(/\/+$/, '')
const GH_PROXY = process.env.GH_PROXY || ''
const KEEP_VERSIONS = parseInt(process.env.KEEP_VERSIONS || '2', 10)

let changed = false  // 是否有数据变更，后续需要 commit

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`)
}

function sanitize(s) {
  return s.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_')
}

/** 读取 JSON 文件 */
function readJSON(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    }
  } catch (e) {
    log(`读取 ${filePath} 失败: ${e.message}`)
  }
  return fallback
}

/** 写入 JSON 文件 */
function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

/** 安全 fetch（支持超时和认证） */
async function apiFetch(url, options = {}) {
  const headers = {
    Accept: 'application/vnd.github.v3+json',
    ...options.headers,
  }
  if (GH_TOKEN) headers.Authorization = `Bearer ${GH_TOKEN}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  try {
    const res = await fetch(url, { ...options, headers, signal: ctrl.signal })
    return res
  } finally {
    clearTimeout(timer)
  }
}

/** 从 GitHub 获取 Release 列表 */
async function fetchReleases(repo) {
  const res = await apiFetch(`${GITHUB_API}/repos/${repo}/releases?per_page=20`)
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${res.statusText}`)
  return res.json()
}

/** 从文件名猜平台 */
function guessPlatform(name) {
  const lower = name.toLowerCase()
  if (lower.includes('android') || lower.includes('apk')) return 'Android'
  if (lower.includes('windows') || lower.includes('exe') || lower.includes('msi')) return 'Windows'
  if (lower.includes('macos') || lower.includes('darwin') || lower.includes('dmg')) return 'MacOS'
  if (lower.includes('linux') || lower.includes('deb') || lower.includes('appimage')) return 'Linux'
  return 'Other'
}

/** 生成唯一 ID */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/** 同步单个项目的 GitHub Release */
async function syncProject(project) {
  if (project.sourceType !== 'github' || !project.githubRepo) {
    return { id: project.id, name: project.name, synced: false, reason: '非 GitHub 项目', newVersions: 0 }
  }

  try {
    const releases = await fetchReleases(project.githubRepo)
    if (!releases.length) {
      return { id: project.id, name: project.name, synced: false, reason: '无 Release', newVersions: 0 }
    }

    const existingVersions = new Set(project.versions.map(v => v.version))
    let newCount = 0
    const newVersions = []

    for (const r of releases) {
      if (!existingVersions.has(r.tag_name)) {
        const version = {
          id: uid(),
          version: r.tag_name,
          publishedAt: r.published_at,
          changelog: r.body || '该版本未提供更新日志。',
          downloads: (r.assets || []).map(a => ({
            platform: guessPlatform(a.name),
            filename: a.name,
            size: `${(a.size / 1024 / 1024).toFixed(1)} MB`,
            url: a.browser_download_url,
          })),
        }
        project.versions.push(version)
        newVersions.push(version)
        newCount++
      }
    }

    if (newCount > 0) {
      project.versions.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      const l = project.versions[0]
      project.latestVersion = l.version
      project.latestUpdateTime = l.publishedAt
      changed = true
      log(`  新增 ${newCount} 个版本: ${newVersions.map(v => v.version).join(', ')}`)
    }

    // 更新 Star/Fork
    try {
      const infoRes = await apiFetch(`${GITHUB_API}/repos/${project.githubRepo}`)
      if (infoRes.ok) {
        const info = await infoRes.json()
        project.stars = info.stargazers_count ?? 0
        project.forks = info.forks_count ?? 0
      }
    } catch { /* ignore */ }

    return { id: project.id, name: project.name, synced: true, newVersions: newCount }
  } catch (e) {
    log(`  ✗ 同步失败: ${e.message}`)
    return { id: project.id, name: project.name, synced: false, reason: e.message, newVersions: 0 }
  }
}

/** 获取分类名称 */
function getCategoryName(categories, categoryId) {
  const c = categories.find(c => c.id === categoryId)
  return c ? c.name : '未分类'
}

/** 创建 WebDAV 远程目录（递归） */
async function ensureRemoteDir(client, dirPath) {
  const parts = dirPath.split('/').filter(Boolean)
  let acc = ''
  for (const p of parts) {
    acc += '/' + p
    try {
      if (!(await client.exists(acc))) {
        await client.createDirectory(acc)
      }
    } catch {
      try { await client.createDirectory(acc) } catch { /* ignore */ }
    }
  }
}

/** WebDAV 清理旧版本 */
async function cleanupOldBackups(client, projectDir) {
  try {
    const entries = await client.getDirectoryContents(projectDir)
    const dirs = entries
      .filter(e => e.type === 'directory')
      .sort((a, b) => {
        const am = a.lastmod ? new Date(a.lastmod).getTime() : 0
        const bm = b.lastmod ? new Date(b.lastmod).getTime() : 0
        return bm - am
      })
    for (const entry of dirs.slice(KEEP_VERSIONS)) {
      await client.deleteFile(entry.filename)
      log(`  清理旧版本: ${entry.basename || entry.filename}`)
    }
  } catch { /* ignore */ }
}

/** 备份单个版本的资源到 WebDAV */
async function backupVersion(client, version, categoryName, projectName, ghProxy) {
  const safeCategory = sanitize(categoryName)
  const safeProject = sanitize(projectName)
  const dateStr = version.publishedAt.slice(0, 10)
  const safeVer = sanitize(version.version)
  const versionDir = `${WEBDAV_BASE_DIR}/${safeCategory}/${safeProject}/${dateStr}_${safeVer}`

  try {
    if (await client.exists(versionDir)) {
      return { version: version.version, status: 'skip', message: '已存在' }
    }

    await ensureRemoteDir(client, versionDir)
    let fileCount = 0

    for (const dl of version.downloads) {
      try {
        const original = dl.url.replace(/^https?:\/\//, '')
        const url = ghProxy ? ghProxy.replace(/\/+$/, '') + '/' + original : dl.url
        const resp = await fetch(url)
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const buffer = Buffer.from(await resp.arrayBuffer())
        await client.putFileContents(`${versionDir}/${dl.filename}`, buffer)
        fileCount++
      } catch (e) {
        log(`    ✗ ${dl.filename} 下载失败: ${e.message}`)
      }
    }

    return { version: version.version, status: 'done', files: fileCount }
  } catch (e) {
    return { version: version.version, status: 'error', message: e.message }
  }
}

// =============================================================

async function main() {
  log('=== 开始同步 + 备份 ===')

  // 1. 读取数据
  const projects = readJSON(PROJECTS_FILE, [])
  const categories = readJSON(CATEGORIES_FILE, [])
  let settings = readJSON(SETTINGS_FILE, null)

  if (!projects.length) {
    log('没有找到项目数据，跳过')
    return
  }

  // 2. 同步 GitHub Releases
  log(`\n--- 同步 GitHub Release (${projects.length} 个项目) ---`)
  let totalNew = 0
  for (const project of projects) {
    log(`  ${project.name} (${project.githubRepo || 'N/A'})`)
    const result = await syncProject(project)
    totalNew += result.newVersions
  }
  log(`共新增 ${totalNew} 个版本`)

  // 3. 写回同步后的数据
  writeJSON(PROJECTS_FILE, projects)

  // 4. WebDAV 备份
  if (WEBDAV_URL && WEBDAV_USERNAME && WEBDAV_PASSWORD) {
    log('\n--- WebDAV 备份 ---')
    const client = createClient(WEBDAV_URL, {
      username: WEBDAV_USERNAME,
      password: WEBDAV_PASSWORD,
    })

    for (const project of projects) {
      if (project.sourceType !== 'github' || !project.versions.length) continue
      const categoryName = getCategoryName(categories, project.categoryId)

      // 只备份最近的 KEEP_VERSIONS 个版本
      const sorted = [...project.versions].sort(
        (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
      )
      const toBackup = sorted.slice(0, KEEP_VERSIONS)

      for (const ver of toBackup) {
        log(`  ${project.name} ${ver.version}`)
        const result = await backupVersion(client, ver, categoryName, project.name, GH_PROXY)
        log(`    → ${result.status}${result.files ? ` (${result.files} 文件)` : ''}${result.message ? ': ' + result.message : ''}`)
      }

      // 清理旧版本
      const safeCategory = sanitize(categoryName)
      const safeProject = sanitize(project.name)
      const projectDir = `${WEBDAV_BASE_DIR}/${safeCategory}/${safeProject}`
      await cleanupOldBackups(client, projectDir)
    }
  } else {
    log('\n--- WebDAV 未配置，跳过备份 ---')
  }

  // 5. Commit & Push 变更
  if (changed) {
    log('\n--- 提交变更 ---')
    try {
      execSync('git config user.name "github-actions[bot]"', { stdio: 'pipe' })
      execSync('git config user.email "github-actions[bot]@users.noreply.github.com"', { stdio: 'pipe' })
      execSync('git add public/data/projects.json', { stdio: 'pipe' })
      const diff = execSync('git diff --cached --stat', { encoding: 'utf-8' })
      if (diff.trim()) {
        execSync(`git commit -m "chore(data): 自动同步 GitHub Release [skip ci]"`, { stdio: 'pipe' })
        execSync('git push', { stdio: 'pipe' })
        log('  已提交并推送变更')
      } else {
        log('  无数据变更')
      }
    } catch (e) {
      log(`  提交失败: ${e.message}`)
    }
  } else {
    log('\n无变更，跳过提交')
  }

  log('\n=== 完成 ===')
}

main().catch(e => {
  console.error('脚本异常:', e)
  process.exit(1)
})
