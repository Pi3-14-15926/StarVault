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
/* CI 环境（GitHub Actions runner 在境外）不需要代理加速；本地中国大陆开发需要
 * 通过 process.env.CI / GITHUB_ACTIONS 自动判断，关掉代理让 CI 直连 GitHub 仓库 */
const IS_CI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true'
const GH_PROXY = (process.env.GH_PROXY && !IS_CI) ? process.env.GH_PROXY : ''
const KEEP_VERSIONS = parseInt(process.env.KEEP_VERSIONS || '2', 10)
/* 上传用较长超时（US→CN 跨太平洋链路，19.5MB 可能需要 3-5 分钟）；查询用较短超时 */
const WEBDAV_UPLOAD_TIMEOUT = parseInt(process.env.WEBDAV_UPLOAD_TIMEOUT || '600000', 10)
const WEBDAV_QUERY_TIMEOUT = parseInt(process.env.WEBDAV_QUERY_TIMEOUT || '30000', 10)
const WEBDAV_RETRIES = parseInt(process.env.WEBDAV_RETRIES || '3', 10)

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

/** 给 Promise 加超时：注意此处故意使用 Promise.race 假超时——
 *  如果真用 AbortController abort 底层 fetch，会导致 server 端 TCP 收到 RST
 *  从而丢弃已收数据；假超时让底层 fetch 继续跑，最终 server 端能收到完整文件 */
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`操作超时 (${ms}ms)`)), ms)),
  ])
}

/** 真正可取消的 AbortController 超时（用于轻量查询操作）
 *  返回 { signal, cancel }，调用方应把 signal 透传给底层 fetch/webdav 调用 */
function abortableTimeout(ms) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(new Error(`操作超时 (${ms}ms)`)), ms)
  return {
    signal: ctrl.signal,
    cancel: () => clearTimeout(timer),
  }
}

/** 给 WebDAV 上传操作加超时（Promise.race 假超时——不取消底层请求）
 *  跨太平洋链路上 19.5MB 上传可能需 3-5 分钟；真取消会损坏 TLS socket 导致后续 EPIPE。
 *  假超时让底层 fetch 继续跑，最终 server 端能收到完整文件；
 *  脚本末尾 process.exit(0) 会强制释放所有 socket */
function webdavUploadOp(thunk, label) {
  return withTimeout(thunk(), WEBDAV_UPLOAD_TIMEOUT).catch(e => {
    throw new Error(`${label}: ${e.message}`)
  })
}

/** 给 WebDAV 轻量操作（exists/getDirContents/createDir/delete）加超时
 *  用真 AbortController，超时后底层请求立即取消，避免查询操作长时间挂起
 *  thunk 接收 AbortSignal 参数，透传给 webdav 库的 options.signal */
function webdavQueryOp(thunk, label) {
  const { signal, cancel } = abortableTimeout(WEBDAV_QUERY_TIMEOUT)
  return thunk(signal).finally(cancel).catch(e => {
    throw new Error(`${label}: ${e.message}`)
  })
}

/** 指数退避重试包装：失败时按 5s, 15s, 30s 等待后重试，最多 WEBDAV_RETRIES 次
 *  只对可重试错误（网络中断、超时、5xx、423 Locked）重试；对 4xx 客户端错误（鉴权失败等）直接抛 */
async function withRetry(fn, label) {
  const isRetriable = (e) => {
    const m = (e?.message || '').toLowerCase()
    /* node-fetch 的 AbortError / FetchError / connect ETIMEDOUT / ECONNRESET */
    if (m.includes('aborted') || m.includes('abort')) return true
    if (m.includes('timeout') || m.includes('超时')) return true
    if (m.includes('econnreset') || m.includes('etimedout') || m.includes('enotfound')) return true
    if (m.includes('socket hang up') || m.includes('fetch failed')) return true
    if (m.includes('epipe')) return true
    /* 5xx 服务端错误（坚果云会返回 507 存储超限等） */
    if (/\b(5\d{2})\b/.test(e?.message || '')) return true
    /* 423 Locked：被之前中断的 PUT 请求残留锁，等几秒后锁自动释放即可重试 */
    if (m.includes('423') || m.includes('locked')) return true
    /* 4xx 客户端错误不重试：401 鉴权、403 禁止、404 路径、412 冲突 */
    return false
  }
  let lastErr
  for (let attempt = 1; attempt <= WEBDAV_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (!isRetriable(e) || attempt === WEBDAV_RETRIES) {
        throw new Error(`${label} 失败（已重试 ${attempt - 1} 次）: ${e.message}`)
      }
      /* 锁残留时多等一会（15s/30s）让服务器释放锁；网络抖动用较短间隔（5s/10s） */
      const isLocked = (e?.message || '').toLowerCase().includes('423') || (e?.message || '').toLowerCase().includes('locked')
      const wait = isLocked ? 15000 * attempt : Math.min(5000 * attempt, 15000)
      log(`    ⚠ ${label} 第 ${attempt} 次失败 (${e.message})${isLocked ? ' [锁残留，等待释放]' : ''}，${wait}ms 后重试...`)
      await new Promise(r => setTimeout(r, wait))
    }
  }
  throw lastErr
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
  if (res.ok) return res.json()
  /* 区分错误：401/404 = 配置/仓库问题；403/429 = 限速（可能是次级限速） */
  const remaining = res.headers.get('x-ratelimit-remaining')
  const reset = res.headers.get('x-ratelimit-reset')
  const retryAfter = res.headers.get('retry-after')
  const tokenNote = GH_TOKEN ? '' : '（未配置 GH_TOKEN，匿名请求 60/h，极易触发限速）'
  if (res.status === 401) throw new Error(`Token 无效或已过期 (401)${tokenNote}`)
  if (res.status === 404) throw new Error(`仓库 ${repo} 不存在、为私有或无访问权限 (404)`)
  if (res.status === 403) {
    const isPrimary = remaining === '0'
    const resetAt = reset ? new Date(Number(reset) * 1000).toISOString().slice(11, 19) : '?'
    if (isPrimary) throw new Error(`GitHub API 限速 (403)，主限速 reset @ ${resetAt} UTC${tokenNote}`)
    throw new Error(`GitHub API 次级限速/禁止 (403)，通常是 IP 被滥用检测或请求过快，建议配置 GH_TOKEN`)
  }
  if (res.status === 429) {
    const wait = retryAfter ? `${retryAfter}s` : '未知'
    throw new Error(`GitHub API 限速 (429)，请 ${wait} 后重试${tokenNote}`)
  }
  throw new Error(`GitHub API 错误: ${res.status} ${res.statusText}`)
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

/** 创建 WebDAV 远程目录（递归） */
async function ensureRemoteDir(client, dirPath) {
  const parts = dirPath.split('/').filter(Boolean)
  let acc = ''
  for (const p of parts) {
    acc += '/' + p
    const exists = await webdavQueryOp(signal => client.exists(acc, { signal }), `检查目录 ${acc}`).catch(() => false)
    if (!exists) {
      await webdavQueryOp(signal => client.createDirectory(acc, { signal }), `创建目录 ${acc}`)
    }
  }
}

/** WebDAV 清理旧版本 */
async function cleanupOldBackups(client, projectDir) {
  try {
    const entries = await webdavQueryOp(signal => client.getDirectoryContents(projectDir, { signal }), `列出目录 ${projectDir}`)
    const dirs = entries
      .filter(e => e.type === 'directory')
      .sort((a, b) => {
        const am = a.lastmod ? new Date(a.lastmod).getTime() : 0
        const bm = b.lastmod ? new Date(b.lastmod).getTime() : 0
        return bm - am
      })
    for (const entry of dirs.slice(KEEP_VERSIONS)) {
      await webdavQueryOp(signal => client.deleteFile(entry.filename, { signal }), `删除 ${entry.basename || entry.filename}`)
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
    const exists = await webdavQueryOp(signal => client.exists(versionDir, { signal }), `检查版本目录 ${versionDir}`)
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
        /* gh-proxy 协议：保留原 URL 的 https://，拼在 proxy base 后面
         * 例：https://gh.api.99988866.xyz/ + https://github.com/xxx/yyy → https://gh.api.99988866.xyz/https://github.com/xxx/yyy
         * CI 环境（GitHub Actions）已自动禁用 GH_PROXY（见顶部 IS_CI 判断） */
        const url = ghProxy ? ghProxy.replace(/\/+$/, '') + '/' + dl.url : dl.url
        log(`    ↓ 下载 ${dl.filename} (${dl.size})`)
        const resp = await fetchWithTimeout(url, 300000)
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
          const buffer = Buffer.from(await resp.arrayBuffer())
          log(`    ↑ 上传 ${dl.filename} → WebDAV (${(buffer.length / 1024 / 1024).toFixed(2)}MB)`)
          /* 上传用假超时（不取消底层请求，避免 TLS socket 损坏导致 EPIPE）；
           * withRetry 处理 423 Locked（锁残留）和 EPIPE（连接断开） */
          await withRetry(
            () => webdavUploadOp(
              () => client.putFileContents(`${versionDir}/${dl.filename}`, buffer),
              `上传 ${dl.filename}`
            ),
            `上传 ${dl.filename}`
          )
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
  log(`环境: ${IS_CI ? 'CI (GitHub Actions)' : '本地'}; GitHub 代理: ${GH_PROXY ? '启用 ' + GH_PROXY : '禁用'}; 上传超时: ${WEBDAV_UPLOAD_TIMEOUT}ms; 查询超时: ${WEBDAV_QUERY_TIMEOUT}ms; 重试: ${WEBDAV_RETRIES} 次`)

  /* 兜底：未捕获的异常（如 EPIPE）强制退出，避免进程挂起不释放 socket */
  process.on('uncaughtException', (e) => {
    console.error(`[${new Date().toISOString()}] 未捕获异常: ${e.message}`)
    process.exit(1)
  })
  process.on('unhandledRejection', (e) => {
    console.error(`[${new Date().toISOString()}] 未处理 Promise 拒绝: ${e}`)
    process.exit(1)
  })

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
      /* 部分中国云盘 WebDAV（如坚果云）会拒绝默认的 node-fetch UA */
      headers: { 'User-Agent': 'SoftwareHub-Backup/1.0 (Node.js)' },
    })

    // 测试连接
    log('  测试 WebDAV 连接...')
    try {
      const baseExists = await webdavQueryOp(signal => client.exists(WEBDAV_BASE_DIR, { signal }), `检查根目录 ${WEBDAV_BASE_DIR}`)
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
        headers: { 'User-Agent': 'SoftwareHub-Backup/1.0 (Node.js)' },
      })
      const entries = []
      const baseDir = WEBDAV_BASE_DIR

      const cats = await webdavQueryOp(signal => client.getDirectoryContents(baseDir, { signal }), '列出分类目录').catch(() => [])
      for (const cat of (cats.filter(c => c.type === 'directory'))) {
        const catName = sanitize(cat.basename || cat.filename.split('/').pop() || '')
        const projs = await webdavQueryOp(signal => client.getDirectoryContents(cat.filename, { signal }), `列出 ${catName}`).catch(() => [])
        for (const proj of (projs.filter(p => p.type === 'directory'))) {
          const projName = sanitize(proj.basename || proj.filename.split('/').pop() || '')
          const vers = await webdavQueryOp(signal => client.getDirectoryContents(proj.filename, { signal }), `列出 ${projName}`).catch(() => [])
          for (const ver of (vers.filter(v => v.type === 'directory'))) {
            const verName = ver.basename || ver.filename.split('/').pop() || ''
            const files = await webdavQueryOp(signal => client.getDirectoryContents(ver.filename, { signal }), `列出 ${verName}`).catch(() => [])
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

  // 6. Commit & Push 变更（LOCAL_MODE=1 时跳过，dev 本地调试用）
  const LOCAL_MODE = process.env.LOCAL_MODE === '1'
  if (LOCAL_MODE) {
    log('\n--- LOCAL_MODE 模式：跳过 commit/push ---')
  } else if (changed || manifestBackedUp) {
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
