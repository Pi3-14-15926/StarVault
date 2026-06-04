import type { Plugin, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'http'
import { createClient, type WebDAVClient, type FileStat } from 'webdav'
import { writeFileSync } from 'fs'
import { resolve } from 'path'

interface BackupProject {
  categoryName: string
  projectName: string
  projectId: string
  versions: {
    version: string
    publishedAt: string
    downloads: { filename: string; url: string }[]
  }[]
}

interface BackupRequestBody {
  projects: BackupProject[]
  ghProxy?: string
}

interface BackupFileEntry {
  category: string
  project: string
  versionDir: string
  files: { name: string; size: number; url: string }[]
}

interface DeleteItem {
  category: string
  project: string
  versionDir: string
  filename?: string
}

interface WebdavConfig {
  url: string
  username: string
  password: string
  baseDir: string
}

const KEEP_LATEST = 2

let webdavConfig: WebdavConfig | null = null
let webdavClient: WebDAVClient | null = null

const backupPauseState = { paused: false, resolve: null as (() => void) | null }

function getOrInitClient(): WebDAVClient | null {
  if (!webdavConfig) return null
  if (!webdavClient) {
    webdavClient = createClient(webdavConfig.url, {
      username: webdavConfig.username,
      password: webdavConfig.password,
    })
  }
  return webdavClient
}

function remotePath(segments: string[]): string {
  if (!webdavConfig) return ''
  const base = webdavConfig.baseDir.replace(/\/+$/, '')
  return base + '/' + segments.filter(Boolean).join('/')
}

function getBasename(entry: FileStat): string {
  return entry.basename || entry.filename.replace(/\/+$/, '').split('/').pop() || ''
}

async function checkPause(res: ServerResponse) {
  while (backupPauseState.paused) {
    writeNdjson(res, { type: 'paused' })
    await new Promise<void>(resolve => { backupPauseState.resolve = resolve })
    writeNdjson(res, { type: 'resumed' })
  }
}

function writeNdjson(res: ServerResponse, data: any) {
  res.write(JSON.stringify(data) + '\n')
}

function sanitize(s: string): string {
  return s.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_')
}

async function ensureRemoteDir(client: WebDAVClient, dirPath: string) {
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

async function listRemoteDir(client: WebDAVClient, dirPath: string): Promise<FileStat[]> {
  try {
    return (await client.getDirectoryContents(dirPath)) as FileStat[]
  } catch {
    return []
  }
}

async function deleteRemote(client: WebDAVClient, path: string) {
  try { await client.deleteFile(path) } catch { /* ignore */ }
}

async function remoteExists(client: WebDAVClient, path: string): Promise<boolean> {
  try { return await client.exists(path) } catch { return false }
}

async function cascadeCleanup(client: WebDAVClient, dirPath: string) {
  if (!webdavConfig) return
  const base = webdavConfig.baseDir.replace(/\/+$/, '')
  let current = dirPath.replace(/\/+$/, '')
  while (current.startsWith(base) && current !== base) {
    const entries = await listRemoteDir(client, current)
    if (entries.length > 0) break
    await deleteRemote(client, current)
    current = current.split('/').slice(0, -1).join('/')
  }
}

async function cleanupOldBackups(client: WebDAVClient, projectDir: string) {
  const entries = await listRemoteDir(client, projectDir)
  const dirs = entries
    .filter(e => e.type === 'directory')
    .sort((a, b) => {
      const am = a.lastmod ? new Date(a.lastmod).getTime() : 0
      const bm = b.lastmod ? new Date(b.lastmod).getTime() : 0
      return bm - am
    })
  for (const entry of dirs.slice(KEEP_LATEST)) {
    await deleteRemote(client, entry.filename)
  }
}

function fileUrl(category: string, project: string, versionDir: string, fname: string): string {
  if (webdavConfig) {
    return remotePath([category, project, versionDir, fname])
  }
  return ''
}

async function handleBackup(req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })

  const client = getOrInitClient()
  if (!client) {
    writeNdjson(res, { type: 'error', message: 'WebDAV 未配置，请先设置 WebDAV 连接信息' })
    res.end()
    return
  }

  let raw = ''
  req.on('data', (chunk: string) => (raw += chunk))
  req.on('end', async () => {
    try {
      const body: BackupRequestBody = JSON.parse(raw)
      const { projects, ghProxy } = body

      let totalVersions = 0
      for (const p of projects) {
        const sorted = [...p.versions].sort(
          (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
        )
        totalVersions += Math.min(sorted.length, KEEP_LATEST)
      }
      writeNdjson(res, { type: 'meta', total: projects.length, totalVersions })

      let doneVersions = 0
      for (const project of projects) {
        const safeCategory = sanitize(project.categoryName)
        const safeProject = sanitize(project.projectName)
        const projectDir = remotePath([safeCategory, safeProject])

        const sorted = [...project.versions].sort(
          (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
        )
        const toBackup = sorted.slice(0, KEEP_LATEST)

        for (const ver of toBackup) {
          const dateStr = ver.publishedAt.slice(0, 10)
          const safeVer = sanitize(ver.version)
          const versionDir = remotePath([safeCategory, safeProject, `${dateStr}_${safeVer}`])

          if (await remoteExists(client, versionDir)) {
            writeNdjson(res, {
              type: 'skip',
              project: project.projectName,
              version: ver.version,
              message: '已存在，跳过',
            })
            doneVersions++
            writeNdjson(res, { type: 'progress', doneVersions, totalVersions })
            continue
          }

          await ensureRemoteDir(client, versionDir)

          for (const dl of ver.downloads) {
            await checkPause(res)
            try {
              const original = dl.url.replace(/^https?:\/\//, '')
              const url = ghProxy ? ghProxy.replace(/\/+$/, '') + '/' + original : dl.url
              const resp = await fetch(url)
              if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
              const buffer = Buffer.from(await resp.arrayBuffer())

              await client.putFileContents(versionDir + '/' + dl.filename, buffer)

              writeNdjson(res, {
                type: 'file',
                project: project.projectName,
                version: ver.version,
                file: dl.filename,
                message: '已上传到 WebDAV',
              })
            } catch (e: any) {
              writeNdjson(res, {
                type: 'error',
                project: project.projectName,
                version: ver.version,
                file: dl.filename,
                message: `上传失败: ${e.message}`,
              })
            }
          }
          doneVersions++
          writeNdjson(res, { type: 'progress', doneVersions, totalVersions })
        }

        await cleanupOldBackups(client, projectDir)
      }

      writeNdjson(res, { type: 'done' })
    } catch (e: any) {
      writeNdjson(res, { type: 'error', message: e.message })
    }
    res.end()
  })
  req.on('error', () => res.end())
}

async function handleListFiles(_req: IncomingMessage, res: ServerResponse) {
  const client = getOrInitClient()
  if (!client) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ entries: [] }))
    return
  }

  const baseDir = webdavConfig!.baseDir.replace(/\/+$/, '')
  const entries: BackupFileEntry[] = []

  const categories = await listRemoteDir(client, baseDir)
  for (const cat of categories) {
    if (cat.type !== 'directory') continue
    const catName = getBasename(cat)
    const projects = await listRemoteDir(client, cat.filename)
    for (const proj of projects) {
      if (proj.type !== 'directory') continue
      const projName = getBasename(proj)
      const versions = await listRemoteDir(client, proj.filename)
      for (const ver of versions) {
        if (ver.type !== 'directory') continue
        const verName = getBasename(ver)
        const files = await listRemoteDir(client, ver.filename)
        const fileEntries = files
          .filter(f => f.type === 'file')
          .map(f => ({
            name: getBasename(f),
            size: f.size || 0,
            url: fileUrl(catName, projName, verName, getBasename(f)),
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

  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ entries }))
}

async function handleDeleteFiles(req: IncomingMessage, res: ServerResponse) {
  const client = getOrInitClient()
  if (!client) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: false, error: 'WebDAV 未配置' }))
    return
  }

  let raw = ''
  req.on('data', (chunk: string) => (raw += chunk))
  req.on('end', async () => {
    try {
      const { items } = JSON.parse(raw) as { items: DeleteItem[] }
      const results: { path: string; deleted: boolean; error?: string }[] = []

      for (const item of items) {
        try {
          const segs = [item.category, item.project, item.versionDir]
          if (item.filename) segs.push(item.filename)
          const fullPath = remotePath(segs)

          if (!(await remoteExists(client, fullPath))) {
            results.push({ path: fullPath, deleted: false, error: '文件不存在' })
            continue
          }

          await deleteRemote(client, fullPath)
          results.push({ path: fullPath, deleted: true })

          const parentDir = remotePath([item.category, item.project, item.versionDir])
          await cascadeCleanup(client, parentDir)
        } catch (e: any) {
          const segs = [item.category, item.project, item.versionDir]
          if (item.filename) segs.push(item.filename)
          results.push({ path: remotePath(segs), deleted: false, error: e.message })
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true, results }))
    } catch (e: any) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: e.message }))
    }
  })
  req.on('error', () => res.end())
}

function handleTogglePause(req: IncomingMessage, res: ServerResponse) {
  let raw = ''
  req.on('data', (chunk: string) => (raw += chunk))
  req.on('end', () => {
    try {
      const { paused } = JSON.parse(raw) as { paused: boolean }
      backupPauseState.paused = paused
      if (!paused && backupPauseState.resolve) {
        backupPauseState.resolve()
        backupPauseState.resolve = null
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true, paused: backupPauseState.paused }))
    } catch (e: any) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: e.message }))
    }
  })
  req.on('error', () => res.end())
}

function handleWebdavConfig(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    if (webdavConfig) {
      res.end(JSON.stringify({ ...webdavConfig, password: '' }))
    } else {
      res.end(JSON.stringify(null))
    }
    return
  }

  let raw = ''
  req.on('data', (chunk: string) => (raw += chunk))
  req.on('end', () => {
    try {
      const config = JSON.parse(raw) as WebdavConfig
      if (config.password === '' && webdavConfig) {
        config.password = webdavConfig.password
      }
      webdavConfig = config
      webdavClient = null
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true }))
    } catch (e: any) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: e.message }))
    }
  })
  req.on('error', () => res.end())
}

function handleBakeDefaults(req: IncomingMessage, res: ServerResponse) {
  let raw = ''
  req.on('data', (chunk: string) => (raw += chunk))
  req.on('end', () => {
    try {
      const settings = JSON.parse(raw)
      const code = `import type { Settings } from './types'\n\nexport const DEFAULT_SETTINGS: Settings = ${JSON.stringify(settings, null, 2)}\n`
      const filePath = resolve(__dirname, 'src', 'defaults.ts')
      writeFileSync(filePath, code, 'utf-8')
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true }))
    } catch (e: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: e.message }))
    }
  })
  req.on('error', () => res.end())
}

export function backupPlugin(): Plugin {
  return {
    name: 'backup-plugin',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next) => {
        if (!req.url) return next()

        if (req.method === 'POST' && req.url === '/__backup-assets') {
          backupPauseState.paused = false
          handleBackup(req, res)
          return
        }

        if (req.url === '/__backup-files') {
          handleListFiles(req, res)
          return
        }

        if (req.method === 'POST' && req.url === '/__backup-delete') {
          handleDeleteFiles(req, res)
          return
        }

        if (req.method === 'POST' && req.url === '/__backup-toggle') {
          handleTogglePause(req, res)
          return
        }

        if (req.url === '/__backup-webdav-config') {
          handleWebdavConfig(req, res)
          return
        }

        if (req.method === 'POST' && req.url === '/__bake-defaults') {
          handleBakeDefaults(req, res)
          return
        }

        next()
      })
    },
  }
}
