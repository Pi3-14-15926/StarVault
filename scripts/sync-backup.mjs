/**
 * GitHub Actions 定时同步 + rclone 备份脚本
 *
 * 通过 Repository Secrets 配置多渠道云盘备份：
 *   BACKUP_CHANNEL      — 默认备份渠道（webdav / onedrive / gdrive）
 *   WEBDAV_URL          — WebDAV 服务器地址
 *   WEBDAV_USERNAME     — WebDAV 用户名
 *   WEBDAV_PASSWORD     — WebDAV 密码
 *   WEBDAV_BASE_DIR     — WebDAV 根目录（默认 /SoftwareHub）
 *   ONEDRIVE_TOKEN      — OneDrive OAuth2 token JSON
 *   GDRIVE_TOKEN        — Google Drive OAuth2 token JSON
 *   GH_TOKEN            — GitHub 个人访问令牌（可选，提高 API 限流）
 *   GH_PROXY            — GitHub 下载加速代理（可选，CI 环境自动禁用）
 *   KEEP_VERSIONS       — 每个项目保留的版本数（默认 2）
 *   MAX_FILE_SIZE_MB    — 文件大小限制（默认 500MB）
 *   UPLOAD_TIMEOUT      — 上传超时秒数（默认 600）
 */

import fs from 'fs'
import path from 'path'
import { execSync, spawn } from 'child_process'
import os from 'os'

const DATA_DIR = path.resolve('public/data')
const PAGE_DIR = path.resolve('public/page')
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json')
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json')
const INDEX_FILE = path.join(DATA_DIR, 'index.json')

const GITHUB_API = 'https://api.github.com'

// ===== 环境变量 =====
const GH_TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || ''
const BACKUP_CHANNEL = process.env.BACKUP_CHANNEL || 'webdav'
const WEBDAV_URL = process.env.WEBDAV_URL || ''
const WEBDAV_USERNAME = process.env.WEBDAV_USERNAME || ''
const WEBDAV_PASSWORD = process.env.WEBDAV_PASSWORD || ''
const WEBDAV_BASE_DIR = (process.env.WEBDAV_BASE_DIR || '/SoftwareHub').replace(/\/+$/, '')
const ONEDRIVE_TOKEN = process.env.ONEDRIVE_TOKEN || ''
const GDRIVE_TOKEN = process.env.GDRIVE_TOKEN || ''
const IS_CI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true'
const GH_PROXY = (process.env.GH_PROXY && !IS_CI) ? process.env.GH_PROXY : ''
const KEEP_VERSIONS = parseInt(process.env.KEEP_VERSIONS || '2', 10)
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB || '500', 10) * 1024 * 1024
const UPLOAD_TIMEOUT = parseInt(process.env.UPLOAD_TIMEOUT || '600', 10) * 1000

let changed = false

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

// ============================================================
// 新数据模型读取/写回
// ============================================================

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

function updateIndex(projects) {
  const oldIndex = readJSON(INDEX_FILE, [])
  const oldById = new Map((oldIndex || []).map((e) => [e.id, e]))

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
      ...old,
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

  const knownIds = new Set(projects.map((p) => p.id))
  for (const e of oldIndex || []) {
    if (!knownIds.has(e.id)) newIndex.push(e)
  }

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

function writeToNewModel(projects) {
  const grouped = new Map()
  for (const p of projects) {
    const slug = p.categorySlug
    if (!slug) continue
    if (!grouped.has(slug)) grouped.set(slug, { software: [], versions: [], downloads: [] })
    const g = grouped.get(slug)
    const { versions, categorySlug, ...sw } = p
    g.software.push(sw)
    for (const v of versions) {
      const { downloads, ...verRest } = v
      g.versions.push(verRest)
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

// ============================================================
// GitHub API 相关函数
// ============================================================

async function apiFetch(url, options = {}) {
  const headers = {
    Accept: 'application/vnd.github.v3+json',
    ...options.headers,
  }
  if (GH_TOKEN) headers.Authorization = `Bearer ${GH_TOKEN}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 30000)
  try {
    return await fetch(url, { ...options, headers, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function fetchReleases(repo) {
  const res = await apiFetch(`${GITHUB_API}/repos/${repo}/releases?per_page=20`)
  if (res.ok) return res.json()
  const tokenNote = GH_TOKEN ? '' : '（未配置 GH_TOKEN，匿名请求 60/h，极易触发限速）'
  if (res.status === 401) throw new Error(`Token 无效或已过期 (401)${tokenNote}`)
  if (res.status === 404) throw new Error(`仓库 ${repo} 不存在、为私有或无访问权限 (404)`)
  if (res.status === 403) throw new Error(`GitHub API 限速 (403)，建议配置 GH_TOKEN${tokenNote}`)
  if (res.status === 429) throw new Error(`GitHub API 限速 (429)`)
  throw new Error(`GitHub API 错误: ${res.status} ${res.statusText}`)
}

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

function guessPlatform(name) {
  const lower = name.toLowerCase()
  if (lower.includes('android') || lower.includes('apk')) return 'Android'
  if (lower.includes('windows') || lower.includes('exe') || lower.includes('msi')) return 'Windows'
  if (lower.includes('macos') || lower.includes('darwin') || lower.includes('dmg')) return 'MacOS'
  if (lower.includes('linux') || lower.includes('deb') || lower.includes('appimage')) return 'Linux'
  return 'Other'
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function normalizeRepo(repo) {
  if (!repo) return ''
  return repo
    .trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/^github\.com\//i, '')
    .replace(/^\/+|\/+$/g, '')
}

async function syncProject(project) {
  const cleanRepo = normalizeRepo(project.githubRepo)
  if (project.sourceType !== 'github' || !cleanRepo) {
    return { id: project.id, name: project.name, synced: false, reason: '非 GitHub 项目', newVersions: 0 }
  }
  if (project.githubRepo !== cleanRepo) {
    log(`    清洗 githubRepo: "${project.githubRepo}" → "${cleanRepo}"`)
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
    log(`  同步失败: ${e.message}`)
    return { id: project.id, name: project.name, synced: false, reason: e.message, newVersions: 0 }
  }
}

function getCategoryName(categories, key) {
  if (!key) return '未分类'
  const c = categories.find((c) => c.slug === key || c.id === key)
  return c ? c.name : '未分类'
}

// ============================================================
// rclone 核心函数
// ============================================================

async function fetchWithTimeout(url, timeoutMs = 60000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** 获取 rclone 可执行文件路径（CI 自动安装到 /usr/bin，本地用 scripts/bin/） */
function getRclonePath() {
  if (IS_CI) {
    try {
      return execSync('which rclone', { encoding: 'utf-8' }).trim()
    } catch { /* fallback below */ }
  }
  const localPath = path.resolve('scripts/bin/rclone.exe')
  if (fs.existsSync(localPath)) return localPath
  try {
    if (process.platform === 'win32') {
      return execSync('where rclone', { encoding: 'utf-8' }).trim().split('\n')[0]
    }
    return execSync('which rclone', { encoding: 'utf-8' }).trim()
  } catch {
    throw new Error('未找到 rclone，请先安装')
  }
}

/** 通过 rclone config create 动态生成远程配置（自动处理密码混淆） */
function generateRcloneConf() {
  const rclone = getRclonePath()
  let created = false

  // WebDAV 渠道
  if (WEBDAV_URL && WEBDAV_USERNAME && WEBDAV_PASSWORD) {
    try {
      execSync(`${rclone} config create webdav webdav url="${WEBDAV_URL}" vendor=other user="${WEBDAV_USERNAME}" pass="${WEBDAV_PASSWORD}"`, {
        stdio: 'pipe',
        timeout: 15000,
      })
      log('  rclone 远程 [webdav] 已创建')
      created = true
    } catch (e) {
      log(`  创建 webdav 远程失败: ${e.message}`)
    }
  }

  // OneDrive 渠道
  if (ONEDRIVE_TOKEN) {
    try {
      execSync(`${rclone} config create onedrive onedrive token='${ONEDRIVE_TOKEN}'`, {
        stdio: 'pipe',
        timeout: 15000,
      })
      log('  rclone 远程 [onedrive] 已创建')
      created = true
    } catch (e) {
      log(`  创建 onedrive 远程失败: ${e.message}`)
    }
  }

  // Google Drive 渠道
  if (GDRIVE_TOKEN) {
    try {
      execSync(`${rclone} config create gdrive drive token='${GDRIVE_TOKEN}' scope=drive`, {
        stdio: 'pipe',
        timeout: 15000,
      })
      log('  rclone 远程 [gdrive] 已创建')
      created = true
    } catch (e) {
      log(`  创建 gdrive 远程失败: ${e.message}`)
    }
  }

  if (!created) {
    log('警告: 未配置任何云盘渠道（WEBDAV_URL / ONEDRIVE_TOKEN / GDRIVE_TOKEN）')
    return null
  }
  return true
}

/** 使用 rclone copyto 同步单个文件到远程存储 */
async function rcloneCopyFile(localFilePath, remotePath, timeoutMs = UPLOAD_TIMEOUT) {
  const rclone = getRclonePath()
  const remote = `${BACKUP_CHANNEL}:`
  const dest = `${remote}${remotePath}`

  return new Promise((resolve, reject) => {
    const args = [
      'copyto', localFilePath, dest,
      '--no-traverse',
      '--checksum',
    ]

    const proc = spawn(rclone, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stderr = ''
    let killed = false

    const timer = setTimeout(() => {
      killed = true
      try { proc.kill('SIGTERM') } catch { /* noop */ }
      setTimeout(() => {
        if (proc && !proc.killed) {
          try { proc.kill('SIGKILL') } catch { /* noop */ }
        }
      }, 2000)
    }, timeoutMs)

    proc.stderr.on('data', (data) => {
      stderr += data.toString('utf-8')
    })

    proc.on('close', (code) => {
      clearTimeout(timer)
      if (killed) {
        resolve({ ok: false, message: '上传超时，已跳过' })
      } else if (code === 0) {
        resolve({ ok: true })
      } else {
        resolve({ ok: false, message: stderr || `rclone 退出码: ${code}` })
      }
    })

    proc.on('error', (err) => {
      clearTimeout(timer)
      reject(new Error(`启动 rclone 失败: ${err.message}`))
    })
  })
}

/** 检查远程文件是否存在 */
async function remoteFileExists(remotePath) {
  const rclone = getRclonePath()
  const remote = `${BACKUP_CHANNEL}:`
  const fullPath = `${remote}${remotePath}`

  return new Promise((resolve) => {
    const args = ['lsf', fullPath, '--max-depth', '0']
    const proc = spawn(rclone, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    proc.stdout.on('data', (d) => { stdout += d.toString() })
    proc.on('close', (code) => {
      resolve(code === 0 && stdout.trim().length > 0)
    })
    proc.on('error', () => resolve(false))
  })
}

/** 测试 rclone 连接 */
async function testRcloneConnection() {
  const rclone = getRclonePath()
  const remote = `${BACKUP_CHANNEL}:`

  return new Promise((resolve) => {
    const args = ['lsf', `${remote}${WEBDAV_BASE_DIR}/`, '--max-depth', '0']
    const proc = spawn(rclone, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    proc.stderr.on('data', (d) => { stderr += d.toString() })
    proc.on('close', (code) => {
      resolve({ ok: code === 0, message: stderr || '' })
    })
    proc.on('error', (err) => {
      resolve({ ok: false, message: err.message })
    })
  })
}

/** 清理旧版本（保留最近 KEEP_VERSIONS 个版本目录） */
async function cleanupOldVersions(projectDir) {
  const rclone = getRclonePath()
  const remote = `${BACKUP_CHANNEL}:`
  const fullPath = `${remote}${projectDir}/`

  return new Promise((resolve) => {
    const args = ['lsf', fullPath, '--max-depth', '1', '--dirs-only']
    const proc = spawn(rclone, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    proc.stdout.on('data', (d) => { stdout += d.toString() })
    proc.on('close', async (code) => {
      if (code !== 0) return resolve()
      const dirs = stdout.split('\n').filter(Boolean).sort().reverse()
      for (const dir of dirs.slice(KEEP_VERSIONS)) {
        const dirName = dir.replace(/\/$/, '')
        const deletePath = `${projectDir}/${dirName}`
        log(`    清理旧版本: ${dirName}`)
        // 使用 rclone delete 删除目录
        try {
          const delProc = spawn(rclone, ['delete', `${remote}${deletePath}`, '--rmdirs'], {
            stdio: ['ignore', 'pipe', 'pipe'],
          })
          await new Promise((res) => delProc.on('close', res))
        } catch { /* ignore */ }
      }
      resolve()
    })
    proc.on('error', () => resolve())
  })
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  log('=== 开始同步 + rclone 备份 ===')

  // 检查备份渠道
  const channelOk = checkChannel()
  if (!channelOk) {
    log('未配置有效的备份渠道，仅执行同步')
  }

  process.on('uncaughtException', (e) => {
    console.error(`[${new Date().toISOString()}] 未捕获异常: ${e.message}`)
    process.exit(1)
  })
  process.on('unhandledRejection', (e) => {
    console.error(`[${new Date().toISOString()}] 未处理 Promise 拒绝: ${e}`)
    process.exit(1)
  })

  // 1. 读取数据
  const { categories, projects: loadedProjects } = loadFromNewModel()
  const projects = loadedProjects

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
  if (totalNew > 0) {
    writeToNewModel(projects)
    if (updateIndex(projects)) {
      log('  index.json 已更新')
    }
    changed = true
  }

  // 4. rclone 备份
  if (channelOk) {
    log(`\n--- rclone 备份 (渠道: ${BACKUP_CHANNEL}) ---`)

    // 生成 rclone.conf
    generateRcloneConf()

    // 测试连接
    log('  测试连接...')
    const conn = await testRcloneConnection()
    if (!conn.ok) {
      log(`  连接失败: ${conn.message || '未知错误'}，跳过备份`)
    } else {
      log('  连接成功')

      // 逐个下载文件，每下载一个立即同步到云盘
      const backupDir = path.resolve('.backup-temp')
      fs.mkdirSync(backupDir, { recursive: true })

      let totalFiles = 0
      let syncedFiles = 0
      let skippedFiles = 0
      let failedFiles = 0

      for (const project of projects) {
        if (project.sourceType !== 'github' || !project.versions.length) continue
        const categoryName = getCategoryName(categories, project.categorySlug)
        const safeCategory = sanitize(categoryName)
        const safeProject = sanitize(project.name)

        const sorted = [...project.versions].sort(
          (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
        )
        const toBackup = sorted.slice(0, KEEP_VERSIONS)

        for (const ver of toBackup) {
          const dateStr = ver.publishedAt.slice(0, 10)
          const safeVer = sanitize(ver.version)
          const versionDir = `${WEBDAV_BASE_DIR}/${safeCategory}/${safeProject}/${dateStr}_${safeVer}`

          log(`\n  [${project.name}] ${ver.version}`)

          for (const dl of ver.downloads) {
            totalFiles++

            // 跳过过大的文件
            if (parseSize(dl.size) > MAX_FILE_SIZE) {
              log(`    ⏭ 跳过 ${dl.filename} (${dl.size})，超过大小限制`)
              skippedFiles++
              continue
            }

            // 检查远程文件是否存在
            const remoteFilePath = `${versionDir}/${dl.filename}`
            const exists = await remoteFileExists(remoteFilePath)
            if (exists) {
              skippedFiles++
              log(`    ⏭ ${dl.filename} 已存在，跳过`)
              continue
            }

            // 下载文件到本地临时目录
            const localDir = path.join(backupDir, safeCategory, safeProject, `${dateStr}_${safeVer}`)
            fs.mkdirSync(localDir, { recursive: true })
            const localFilePath = path.join(localDir, dl.filename)

            try {
              const url = GH_PROXY ? GH_PROXY.replace(/\/+$/, '') + '/' + dl.url : dl.url
              log(`    ↓ 下载 ${dl.filename} (${dl.size})`)
              const resp = await fetchWithTimeout(url, UPLOAD_TIMEOUT)
              if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
              const buffer = Buffer.from(await resp.arrayBuffer())
              fs.writeFileSync(localFilePath, buffer)
              log(`    ✓ 已保存 ${(buffer.length / 1024 / 1024).toFixed(2)}MB`)

              // 立即同步到云盘
              log(`    ↑ 同步到 ${BACKUP_CHANNEL}:${remoteFilePath}`)
              const syncResult = await rcloneCopyFile(localFilePath, remoteFilePath)

              if (syncResult.ok) {
                syncedFiles++
                log(`    ✓ 同步成功`)
              } else {
                failedFiles++
                log(`    ✗ 同步失败: ${syncResult.message}`)
              }

              // 删除本地临时文件
              try { fs.unlinkSync(localFilePath) } catch { /* ignore */ }
            } catch (e) {
              failedFiles++
              log(`    ✗ 失败: ${e.message}`)
              try { if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath) } catch { /* ignore */ }
            }
          }
        }
      }

      // 清理临时目录
      log('\n--- 清理临时文件 ---')
      try {
        fs.rmSync(backupDir, { recursive: true, force: true })
        log('  临时目录已删除')
      } catch { /* ignore */ }

      log(`\n--- 备份统计 ---`)
      log(`  总文件数: ${totalFiles}`)
      log(`  已跳过: ${skippedFiles}（已存在或超限）`)
      log(`  新上传: ${syncedFiles}`)
      log(`  失败: ${failedFiles}`)
    }
  }

  // 5. Commit & Push
  const LOCAL_MODE = process.env.LOCAL_MODE === '1'
  if (LOCAL_MODE) {
    log('\n--- LOCAL_MODE 模式：跳过 commit/push ---')
  } else if (changed) {
    log('\n--- 提交变更 ---')
    try {
      execSync('git config user.name "github-actions[bot]"', { stdio: 'pipe' })
      execSync('git config user.email "github-actions[bot]@users.noreply.github.com"', { stdio: 'pipe' })
      execSync('git add public/data/', { stdio: 'pipe' })
      const diff = execSync('git diff --cached --stat', { encoding: 'utf-8' })
      if (diff.trim()) {
        execSync(`git commit -m "chore(data): 同步 GitHub Release + rclone 备份 [skip ci]"`, { stdio: 'pipe' })
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

/** 检查备份渠道是否已配置 */
function checkChannel() {
  switch (BACKUP_CHANNEL) {
    case 'webdav':
      if (!WEBDAV_URL || !WEBDAV_USERNAME || !WEBDAV_PASSWORD) {
        log('WebDAV 渠道未完整配置（需要 WEBDAV_URL + WEBDAV_USERNAME + WEBDAV_PASSWORD）')
        return false
      }
      log(`渠道: WebDAV (${WEBDAV_URL})`)
      return true
    case 'onedrive':
      if (!ONEDRIVE_TOKEN) {
        log('OneDrive 渠道未配置（需要 ONEDRIVE_TOKEN）')
        return false
      }
      log('渠道: OneDrive')
      return true
    case 'gdrive':
      if (!GDRIVE_TOKEN) {
        log('Google Drive 渠道未配置（需要 GDRIVE_TOKEN）')
        return false
      }
      log('渠道: Google Drive')
      return true
    default:
      log(`未知渠道: ${BACKUP_CHANNEL}（支持 webdav / onedrive / gdrive）`)
      return false
  }
}

main().catch(e => {
  console.error('脚本异常:', e)
  process.exit(1)
}).finally(() => process.exit(0))
