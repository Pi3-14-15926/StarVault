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
const PAGE_DIR = path.resolve('public/page')
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json')
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json')
const INDEX_FILE = path.join(DATA_DIR, 'index.json')

const GITHUB_API = 'https://api.github.com'

const GH_TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || ''
const WEBDAV_URL = process.env.WEBDAV_URL || ''
const WEBDAV_USERNAME = process.env.WEBDAV_USERNAME || ''
const WEBDAV_PASSWORD = process.env.WEBDAV_PASSWORD || ''
const WEBDAV_BASE_DIR = (process.env.WEBDAV_BASE_DIR || '/SoftwareHub').replace(/\/+$/, '')
const GH_PROXY = process.env.GH_PROXY || ''
const KEEP_VERSIONS = parseInt(process.env.KEEP_VERSIONS || '2', 10)
const WEBDAV_TIMEOUT = parseInt(process.env.WEBDAV_TIMEOUT || '300000', 10)

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

/* ============================================================
 * 新数据模型读取/写回（分层：page/{slug}/{software,versions,downloads}.json）
 * 组装成与旧脚本兼容的内存结构：
 *   projects: [{
 *     id, name, sourceType, categorySlug, githubRepo, githubUrl, ...,
 *     versions: [{ id, projectId, version, publishedAt, changelog, downloads: [...] }]
 *   }]
 * ============================================================ */

/** 读取新模型数据，组装成项目列表（含内嵌 versions+downloads） */
function loadFromNewModel() {
  const categories = readJSON(CATEGORIES_FILE, [])
  if (!Array.isArray(categories) || categories.length === 0) {
    return { categories, projects: [] }
  }

  const projects = []
  for (const cat of categories) {
    const slug = cat.slug
    if (!slug) continue
    const dir = path.join(PAGE_DIR, slug)
    if (!fs.existsSync(dir)) continue

    const swList = readJSON(path.join(dir, 'software.json'), [])
    const verList = readJSON(path.join(dir, 'versions.json'), [])
    const dlList = readJSON(path.join(dir, 'downloads.json'), [])

    /* 按 projectId 建索引，避免每次 O(n) 查找 */
    const verByProject = new Map()
    for (const v of verList) {
      if (!verByProject.has(v.projectId)) verByProject.set(v.projectId, [])
      verByProject.get(v.projectId).push(v)
    }
    const dlByVer = new Map()
    for (const d of dlList) {
      if (!dlByVer.has(d.versionId)) dlByVer.set(d.versionId, [])
      dlByVer.get(d.versionId).push(d)
    }

    for (const sw of swList) {
      const vers = verByProject.get(sw.id) || []
      const projects2 = vers.map((v) => ({
        ...v,
        downloads: dlByVer.get(v.id) || [],
      }))
      projects.push({ ...sw, categorySlug: slug, versions: projects2 })
    }
  }
  return { categories, projects }
}

/** 更新 data/index.json：
 *  - 保留 index 里有但 projects 中没有的 entry（孤儿数据）
 *  - 合并 project 字段，更新 latestVersionId / latestUpdateTime
 *  - 如果有实际变化返回 true，否则返回 false
 */
function updateIndex(projects) {
  const oldIndex = readJSON(INDEX_FILE, [])
  const oldById = new Map((oldIndex || []).map((e) => [e.id, e]))

  /* 按 publishedAt 倒序取最新版本 */
  function pickLatest(p) {
    if (!p.versions || !p.versions.length) return null
    const sorted = [...p.versions].sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    )
    return sorted[0]
  }

  const newIndex = []
  for (const p of projects) {
    const old = oldById.get(p.id) || {}
    const latest = pickLatest(p)
    newIndex.push({
      ...old,                              // 保留旧字段（website 等）
      id: p.id,
      name: p.name,
      slug: p.slug,
      categorySlug: p.categorySlug,
      description: p.description ?? old.description ?? '',
      logo: p.logo ?? old.logo ?? '',
      featured: p.featured ?? old.featured ?? false,
      latestVersionId: latest?.id,
      latestUpdateTime: latest?.publishedAt || p.latestUpdateTime || new Date(0).toISOString(),
      githubRepo: p.githubRepo,
      githubUrl: p.githubUrl,
      stars: p.stars,
      forks: p.forks,
    })
  }

  /* 保留孤儿（脚本读不到但 index 仍有的项目） */
  const knownIds = new Set(projects.map((p) => p.id))
  for (const e of oldIndex || []) {
    if (!knownIds.has(e.id)) newIndex.push(e)
  }

  /* 检测是否真的有变化 */
  if (newIndex.length !== (oldIndex || []).length) {
    writeJSON(INDEX_FILE, newIndex)
    return true
  }
  for (let i = 0; i < newIndex.length; i++) {
    if (JSON.stringify(newIndex[i]) !== JSON.stringify(oldIndex[i])) {
      writeJSON(INDEX_FILE, newIndex)
      return true
    }
  }
  return false
}

/** 把内存中的 projects 写回新模型（按 categorySlug 分目录写 3 个文件） */
function writeToNewModel(projects) {
  /* 按 categorySlug 分组 */
  const grouped = new Map()
  for (const p of projects) {
    const slug = p.categorySlug
    if (!slug) continue
    if (!grouped.has(slug)) grouped.set(slug, { software: [], versions: [], downloads: [] })
    const g = grouped.get(slug)
    const { versions, categorySlug, ...sw } = p  // 去掉内嵌 versions/categorySlug
    g.software.push(sw)
    for (const v of versions) {
      const { downloads, ...verRest } = v
      g.versions.push(verRest)
      /* 给 version 维护 downloadIds */
      verRest.downloadIds = downloads.map((d) => d.id)
      g.downloads.push(...downloads)
    }
  }
  for (const [slug, data] of grouped) {
    const dir = path.join(PAGE_DIR, slug)
    fs.mkdirSync(dir, { recursive: true })
    writeJSON(path.join(dir, 'software.json'), data.software)
    writeJSON(path.join(dir, 'versions.json'), data.versions)
    writeJSON(path.join(dir, 'downloads.json'), data.downloads)
  }
}

/** 给 Promise 加超时 */
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`操作超时 (${ms}ms)`)), ms)),
  ])
}

/** 安全 fetch（支持超时和认证） */
async function apiFetch(url, options = {}) {
  const headers = {
    Accept: 'application/vnd.github.v3+json',
    ...options.headers,
  }
  if (GH_TOKEN) headers.Authorization = `Bearer ${GH_TOKEN}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 30000)
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

/** 解析文件大小（如 "150.2 MB" → 字节） */
function parseSize(sizeStr) {
  const m = String(sizeStr).match(/^([\d.]+)\s*(KB|MB|GB)/i)
  if (!m) return 0
  const num = parseFloat(m[1])
  const unit = m[2].toUpperCase()
  if (unit === 'KB') return num * 1024
  if (unit === 'MB') return num * 1024 * 1024
  if (unit === 'GB') return num * 1024 * 1024 * 1024
  return 0
}

// 文件大小限制，在 main() 中从 settings / 环境变量读取
let MAX_FILE_SIZE = 500 * 1024 * 1024  // 默认 500MB

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

/** 清洗 repo 字符串：去掉协议、域名、前后斜杠、空白（与 src/utils/github.ts 的 normalizeRepo 保持一致） */
function normalizeRepo(repo) {
  if (!repo) return ''
  return repo
    .trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/^github\.com\//i, '')
    .replace(/^\/+|\/+$/g, '')
}

/** 同步单个项目的 GitHub Release */
async function syncProject(project) {
  /* 入口清洗：避免 "/Rimchars/legado" 这类格式触发 GitHub API 404 */
  const cleanRepo = normalizeRepo(project.githubRepo)
  if (project.sourceType !== 'github' || !cleanRepo) {
    return { id: project.id, name: project.name, synced: false, reason: '非 GitHub 项目', newVersions: 0 }
  }
  /* 把清洗后的值写回内存，写盘时也用清洗后的（持久修复坏数据） */
  if (project.githubRepo !== cleanRepo) {
    log(`    🧹 清洗 githubRepo: "${project.githubRepo}" → "${cleanRepo}"`)
    project.githubRepo = cleanRepo
  }

  try {
    const releases = await fetchReleases(cleanRepo)
    if (!releases.length) {
      return { id: project.id, name: project.name, synced: false, reason: '无 Release', newVersions: 0 }
    }

    const existingVersions = new Set(project.versions.map(v => v.version))
    let newCount = 0
    const newVersions = []

    for (const r of releases) {
      if (!existingVersions.has(r.tag_name)) {
        const verId = uid()
        const downloads = (r.assets || []).map((a) => ({
          id: uid(),
          versionId: verId,
          platform: guessPlatform(a.name),
          filename: a.name,
          size: `${(a.size / 1024 / 1024).toFixed(1)} MB`,
          url: a.browser_download_url,
        }))
        const version = {
          id: verId,
          projectId: project.id,
          version: r.tag_name,
          publishedAt: r.published_at,
          changelog: r.body || '该版本未提供更新日志。',
          downloads,
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

/** 根据 slug 拿分类名称（兼容旧调用：传入 categoryId 或 categorySlug 都能处理） */
function getCategoryName(categories, key) {
  if (!key) return '未分类'
  const c = categories.find((c) => c.slug === key || c.id === key)
  return c ? c.name : '未分类'
}

/** 给 WebDAV 操作加超时 */
function webdavOp(promise, label) {
  return withTimeout(promise, WEBDAV_TIMEOUT).catch(e => {
    throw new Error(`${label}: ${e.message}`)
  })
}

/** 创建 WebDAV 远程目录（递归） */
async function ensureRemoteDir(client, dirPath) {
  const parts = dirPath.split('/').filter(Boolean)
  let acc = ''
  for (const p of parts) {
    acc += '/' + p
    const exists = await webdavOp(client.exists(acc), `检查目录 ${acc}`).catch(() => false)
    if (!exists) {
      await webdavOp(client.createDirectory(acc), `创建目录 ${acc}`)
    }
  }
}

/** WebDAV 清理旧版本 */
async function cleanupOldBackups(client, projectDir) {
  try {
    const entries = await webdavOp(client.getDirectoryContents(projectDir), `列出目录 ${projectDir}`)
    const dirs = entries
      .filter(e => e.type === 'directory')
      .sort((a, b) => {
        const am = a.lastmod ? new Date(a.lastmod).getTime() : 0
        const bm = b.lastmod ? new Date(b.lastmod).getTime() : 0
        return bm - am
      })
    for (const entry of dirs.slice(KEEP_VERSIONS)) {
      await webdavOp(client.deleteFile(entry.filename), `删除 ${entry.basename || entry.filename}`)
      log(`  清理旧版本: ${entry.basename || entry.filename}`)
    }
  } catch { /* ignore */ }
}

/** 带超时的 fetch */
async function fetchWithTimeout(url, timeoutMs = 60000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    return res
  } finally {
    clearTimeout(timer)
  }
}

/** 备份单个版本的资源到 WebDAV */
async function backupVersion(client, version, categoryName, projectName, ghProxy) {
  const safeCategory = sanitize(categoryName)
  const safeProject = sanitize(projectName)
  const dateStr = version.publishedAt.slice(0, 10)
  const safeVer = sanitize(version.version)
  const versionDir = `${WEBDAV_BASE_DIR}/${safeCategory}/${safeProject}/${dateStr}_${safeVer}`

  try {
    const exists = await webdavOp(client.exists(versionDir), `检查版本目录 ${versionDir}`)
    if (exists) {
      return { version: version.version, status: 'skip', message: '已存在' }
    }

    await ensureRemoteDir(client, versionDir)
    let fileCount = 0

    for (const dl of version.downloads) {
      // 跳过过大的文件
      if (parseSize(dl.size) > MAX_FILE_SIZE) {
        log(`    ⏭ ${dl.filename} 文件过大 (${dl.size})，跳过`)
        continue
      }
      try {
        const original = dl.url.replace(/^https?:\/\//, '')
        const url = ghProxy ? ghProxy.replace(/\/+$/, '') + '/' + original : dl.url
        log(`    ↓ 下载 ${dl.filename} (${dl.size})`)
        const resp = await fetchWithTimeout(url, 300000)
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const buffer = Buffer.from(await resp.arrayBuffer())
        log(`    ↑ 上传 ${dl.filename} → WebDAV`)
        await webdavOp(client.putFileContents(`${versionDir}/${dl.filename}`, buffer), `上传 ${dl.filename}`)
        fileCount++
      } catch (e) {
        log(`    ✗ ${dl.filename}: ${e.message}`)
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

  // 1. 读取数据（新模型：page/{slug}/{software,versions,downloads}.json）
  const { categories, projects: loadedProjects } = loadFromNewModel()
  const projects = loadedProjects
  let settings = readJSON(SETTINGS_FILE, null)

  // 从 settings.json → webdav.maxFileSize 读取，环境变量 MAX_FILE_SIZE_MB 可覆盖
  const maxFileSizeMB = parseInt(process.env.MAX_FILE_SIZE_MB || '0', 10)
    || settings?.webdav?.maxFileSize
    || 500
  MAX_FILE_SIZE = maxFileSizeMB * 1024 * 1024
  log(`文件大小限制: ${maxFileSizeMB}MB (超过此大小的文件跳过)`)

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

  // 3. 写回同步后的数据（新模型：page/{slug}/）
  if (totalNew > 0) {
    writeToNewModel(projects)
    if (updateIndex(projects)) {
      log('  index.json 已更新（latestVersion/latestUpdateTime）')
    }
    changed = true
  }

  // 4. WebDAV 备份
  if (WEBDAV_URL && WEBDAV_USERNAME && WEBDAV_PASSWORD) {
    log('\n--- WebDAV 备份 ---')
    const client = createClient(WEBDAV_URL, {
      username: WEBDAV_USERNAME,
      password: WEBDAV_PASSWORD,
    })

    // 测试连接
    log('  测试 WebDAV 连接...')
    try {
      const baseExists = await webdavOp(client.exists(WEBDAV_BASE_DIR), `检查根目录 ${WEBDAV_BASE_DIR}`)
      log(`  根目录 ${WEBDAV_BASE_DIR}: ${baseExists ? '已存在' : '不存在，将在备份时创建'}`)
    } catch (e) {
      log(`  ✗ WebDAV 连接失败: ${e.message}`)
      log('\n=== 完成（WebDAV 备份跳过） ===')
      process.exit(0)
    }

    let totalVersions = 0
    let totalFiles = 0
    for (const project of projects) {
      if (project.sourceType !== 'github' || !project.versions.length) continue
      const sorted = [...project.versions].sort(
        (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
      )
      const toBackup = sorted.slice(0, KEEP_VERSIONS)
      totalVersions += toBackup.length
      for (const ver of toBackup) {
        totalFiles += ver.downloads.length
      }
    }
    log(`  共 ${totalVersions} 个版本, ${totalFiles} 个文件待备份`)

    for (const project of projects) {
      if (project.sourceType !== 'github' || !project.versions.length) continue
      const categoryName = getCategoryName(categories, project.categorySlug)

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

  // 5. 生成备份清单（给前端展示用）
  let manifestBackedUp = false
  if (WEBDAV_URL && WEBDAV_USERNAME && WEBDAV_PASSWORD) {
    log('\n--- 生成备份清单 ---')
    try {
      const client = createClient(WEBDAV_URL, {
        username: WEBDAV_USERNAME,
        password: WEBDAV_PASSWORD,
      })
      const entries = []
      const baseDir = WEBDAV_BASE_DIR

      const cats = await webdavOp(client.getDirectoryContents(baseDir), '列出分类目录').catch(() => [])
      for (const cat of (cats.filter(c => c.type === 'directory'))) {
        const catName = sanitize(cat.basename || cat.filename.split('/').pop() || '')
        const projs = await webdavOp(client.getDirectoryContents(cat.filename), `列出 ${catName}`).catch(() => [])
        for (const proj of (projs.filter(p => p.type === 'directory'))) {
          const projName = sanitize(proj.basename || proj.filename.split('/').pop() || '')
          const vers = await webdavOp(client.getDirectoryContents(proj.filename), `列出 ${projName}`).catch(() => [])
          for (const ver of (vers.filter(v => v.type === 'directory'))) {
            const verName = ver.basename || ver.filename.split('/').pop() || ''
            const files = await webdavOp(client.getDirectoryContents(ver.filename), `列出 ${verName}`).catch(() => [])
            const fileEntries = files
              .filter(f => f.type === 'file')
              .map(f => ({
                name: f.basename || f.filename.split('/').pop() || '',
                size: f.size || 0,
                url: `${baseDir}/${catName}/${projName}/${verName}/${f.basename || f.filename.split('/').pop() || ''}`,
              }))
            if (fileEntries.length > 0) {
              entries.push({
                category: catName,
                project: projName,
                versionDir: verName,
                files: fileEntries,
              })
            }
          }
        }
      }

      /* 保护：如果生成出的 entries 为空，且已存在旧 manifest，不覆盖（避免误清空历史备份） */
      const manifestPath = path.resolve('public/data/backup-manifest.json')
      if (entries.length === 0) {
        const existing = fs.existsSync(manifestPath)
          ? JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
          : null
        if (existing && Array.isArray(existing.entries) && existing.entries.length > 0) {
          log(`  ⚠️ 本次扫描到 0 个项目，但仓库中已有 ${existing.entries.length} 个旧条目 — 跳过覆盖以避免清空历史`)
        } else {
          writeJSON(manifestPath, { entries, updatedAt: new Date().toISOString() })
          manifestBackedUp = true
          log(`  清单完成: 0 个项目（首次写入空清单）`)
        }
      } else {
        writeJSON(manifestPath, { entries, updatedAt: new Date().toISOString() })
        manifestBackedUp = true
        log(`  清单完成: ${entries.length} 个项目`)
      }
    } catch (e) {
      log(`  生成清单失败: ${e.message}`)
    }
  }

  // 6. Commit & Push 变更
  if (changed || manifestBackedUp) {
    log('\n--- 提交变更 ---')
    try {
      execSync('git config user.name "github-actions[bot]"', { stdio: 'pipe' })
      execSync('git config user.email "github-actions[bot]@users.noreply.github.com"', { stdio: 'pipe' })
      execSync('git add public/data/', { stdio: 'pipe' })
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
}).finally(() => process.exit(0))
