<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { NInput, NInputNumber, NProgress, NAlert, NTag, NPopconfirm, useMessage } from 'naive-ui'
import AdminLayout from '../../components/admin/AdminLayout.vue'
import { useProjectStore } from '../../store/project'
import { useCategoryStore } from '../../store/category'
import { useSettingStore } from '../../store/settings'
import { fmtDate } from '../../utils'

interface LogEntry { type: string; project?: string; version?: string; file?: string; message: string }
interface BackupFileEntry { category: string; project: string; versionDir: string; files: { name: string; size: number; url: string }[] }
interface ProjectGroup { category: string; project: string; versions: BackupFileEntry[]; totalFiles: number }

const projects = useProjectStore()
const categories = useCategoryStore()
const settings = useSettingStore()
const message = useMessage()

const backingUp = ref(false)
const paused = ref(false)
const backupTotal = ref(0)
const backupDone = ref(0)
const logs = ref<LogEntry[]>([])
const backupEntries = ref<BackupFileEntry[]>([])
const loadingFiles = ref(false)
const deletingPaths = ref<Set<string>>(new Set())

const webdavForm = ref({
  url: '',
  username: '',
  password: '',
  baseDir: '/SoftwareHub',
  uploadTimeout: 300,
  maxFileSize: 500,
})
const webdavTesting = ref(false)
const webdavTested = ref(false)
const isDev = import.meta.env.DEV

async function loadWebdavConfig() {
  const wd = settings.settings.webdav
  if (wd) {
    webdavForm.value = {
      url: wd.url || '',
      username: wd.username || '',
      password: '',
      baseDir: wd.baseDir || '/SoftwareHub',
      uploadTimeout: wd.uploadTimeout ?? 300,
      maxFileSize: wd.maxFileSize ?? 500,
    }
  }
  if (isDev) {
    try {
      const res = await fetch('/__backup-webdav-config')
      const data = await res.json()
      if (data) {
        webdavForm.value = {
          url: data.url || webdavForm.value.url,
          username: data.username || webdavForm.value.username,
          password: '',
          baseDir: data.baseDir || webdavForm.value.baseDir,
          uploadTimeout: data.uploadTimeout ?? webdavForm.value.uploadTimeout,
          maxFileSize: data.maxFileSize ?? webdavForm.value.maxFileSize,
        }
      }
    } catch { /* ignore */ }
  }
}

async function saveWebdavConfig() {
  const s = { ...settings.settings }
  const storedPwd = s.webdav?.password || ''
  if (!webdavForm.value.password && !storedPwd) {
    message.error('请填写 WebDAV 密码')
    throw new Error('密码为空')
  }
  const resolvedPwd = webdavForm.value.password || storedPwd
  s.webdav = {
    url: webdavForm.value.url,
    username: webdavForm.value.username,
    password: resolvedPwd,
    baseDir: webdavForm.value.baseDir,
    uploadTimeout: webdavForm.value.uploadTimeout,
    maxFileSize: webdavForm.value.maxFileSize,
  }
  settings.save(s)
  if (isDev) {
    try {
      const configToSend = { ...s.webdav, password: webdavForm.value.password || undefined }
      const res = await fetch('/__backup-webdav-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configToSend),
      })
      const data = await res.json()
      if (data.success) webdavTested.value = false
    } catch (e: any) {
      message.warning('同步到服务端失败: ' + e.message)
    }
  }
  message.success('WebDAV 配置已保存')
}

async function testWebdavConnection() {
  webdavTesting.value = true
  try {
    await saveWebdavConfig()
    const res = await fetch('/__backup-files')
    const data = await res.json()
    if (data && Array.isArray(data.entries)) {
      message.success('WebDAV 连接成功')
      webdavTested.value = true
    } else {
      message.error('连接测试失败')
    }
  } catch (e: any) {
    message.error('连接失败: ' + e.message)
  }
  webdavTesting.value = false
}

const projectGroups = computed<ProjectGroup[]>(() => {
  const map = new Map<string, ProjectGroup>()
  for (const e of backupEntries.value) {
    const key = `${e.category}||${e.project}`
    if (!map.has(key)) map.set(key, { category: e.category, project: e.project, versions: [], totalFiles: 0 })
    const group = map.get(key)!
    group.versions.push(e)
    group.totalFiles += e.files.length
  }
  return Array.from(map.values())
})

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + units[i]
}

async function loadBackupFiles() {
  loadingFiles.value = true
  try {
    const manifestUrl = import.meta.env.BASE_URL + 'data/backup-manifest.json'
    const res = await fetch(manifestUrl)
    if (res.ok) {
      const data = await res.json()
      backupEntries.value = data.entries || []
      loadingFiles.value = false
      return
    }
  } catch { /* no manifest */ }
  if (import.meta.env.DEV) {
    try {
      const res = await fetch('/__backup-files')
      const data = await res.json()
      backupEntries.value = data.entries || []
    } catch { backupEntries.value = [] }
  } else {
    backupEntries.value = []
  }
  loadingFiles.value = false
}

async function togglePause() {
  const newState = !paused.value
  paused.value = newState
  await fetch('/__backup-toggle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paused: newState }),
  })
}

async function doBackup() {
  try {
    backingUp.value = true
    paused.value = false
    backupTotal.value = 0
    backupDone.value = 0
    logs.value = []
    logs.value.push({ type: 'meta', message: '正在准备备份任务...' })
    const ghProjects = projects.projects.filter((p) => p.sourceType === 'github' && p.versions.length > 0)
    if (ghProjects.length === 0) {
      logs.value.push({ type: 'meta', message: '没有需要备份的 GitHub 项目' })
      backingUp.value = false
      return
    }
    logs.value.push({ type: 'meta', message: `找到 ${ghProjects.length} 个 GitHub 项目` })
    const backupData = ghProjects.map((p) => ({
      categoryName: categories.categories.find((c) => c.id === p.categoryId)?.name || '未分类',
      projectName: p.name, projectId: p.id,
      versions: p.versions.map((v) => ({
        version: v.version, publishedAt: v.publishedAt,
        downloads: v.downloads.map((d) => ({ filename: d.filename, url: d.url, size: d.size })),
      })),
    }))
    const proxyEnabled = settings.settings.ghProxyEnabled ?? false
    const proxyUrl = settings.settings.ghProxyUrl || ''
    const useProxy = proxyEnabled && proxyUrl
    const requestBody: any = { projects: backupData }
    if (useProxy) requestBody.ghProxy = proxyUrl

    let refreshTimer: ReturnType<typeof setInterval> | null = null
    refreshTimer = setInterval(() => { if (!loadingFiles.value) loadBackupFiles() }, 3000)

    try {
      await saveWebdavConfig()
      logs.value.push({ type: 'meta', message: '发送请求到服务器...' })
      const res = await fetch('/__backup-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
      logs.value.push({ type: 'meta', message: `服务器响应: HTTP ${res.status}` })
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const entry: any = JSON.parse(line)
            if (entry.type === 'paused') { paused.value = true; continue }
            if (entry.type === 'resumed') { paused.value = false; continue }
            if (entry.type === 'meta' && entry.totalVersions != null) { backupTotal.value = entry.totalVersions }
            if (entry.type === 'progress') { backupDone.value = entry.doneVersions; continue }
            logs.value.push(entry)
          } catch { /* skip */ }
        }
      }
    } catch (e: any) {
      logs.value.push({ type: 'error', message: `请求失败: ${e.message}` })
    }
    if (refreshTimer) clearInterval(refreshTimer)
    backingUp.value = false
    loadBackupFiles()
  } catch (e: any) {
    logs.value.push({ type: 'error', message: `备份出错: ${e.message}` })
    backingUp.value = false
  }
}

function logTagType(type: string): 'success' | 'warning' | 'error' | 'info' | 'default' {
  if (type === 'file') return 'success'
  if (type === 'skip') return 'warning'
  if (type === 'error') return 'error'
  if (type === 'meta') return 'info'
  return 'default'
}
function humanType(type: string): string {
  if (type === 'file') return '已下载'
  if (type === 'skip') return '已跳过'
  if (type === 'error') return '失败'
  if (type === 'meta') return '提示'
  if (type === 'done') return '完成'
  return type
}

interface DeleteItem { category: string; project: string; versionDir: string; filename?: string }

async function deleteItems(items: DeleteItem[], label: string) {
  const keys = items.map(i => `${i.category}/${i.project}/${i.versionDir}/${i.filename || ''}`)
  const prev = new Set(deletingPaths.value)
  for (const k of keys) prev.add(k)
  deletingPaths.value = prev
  try {
    const res = await fetch('/__backup-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    })
    const data = await res.json()
    if (data.success) {
      const ok = data.results.filter((r: any) => r.deleted).length
      const fail = data.results.filter((r: any) => !r.deleted)
      if (fail.length === 0) message.success(`已删除 ${ok} 个${label}`)
      else { message.warning(`删除了 ${ok} 个，${fail.length} 个失败`); fail.forEach((r: any) => message.error(`${r.path}: ${r.error}`)) }
      loadBackupFiles()
    } else { message.error(`删除失败: ${data.error}`) }
  } catch (e: any) { message.error(`请求失败: ${e.message}`) }
  const next = new Set(deletingPaths.value)
  for (const k of keys) next.delete(k)
  deletingPaths.value = next
}

function confirmDeleteFile(entry: BackupFileEntry, file: { name: string }) {
  deleteItems([{ category: entry.category, project: entry.project, versionDir: entry.versionDir, filename: file.name }], `文件 ${file.name}`)
}
function confirmDeleteVersion(entry: BackupFileEntry) {
  deleteItems([{ category: entry.category, project: entry.project, versionDir: entry.versionDir }], `版本 ${entry.versionDir}`)
}

onMounted(() => {
  projects.refresh()
  categories.refresh()
  settings.refresh()
  loadBackupFiles()
  loadWebdavConfig()
})
</script>

<template>
  <AdminLayout>
    <div class="backup-scroll">
      <h2 class="page-title">💾 WebDAV 备份</h2>
      <p class="page-desc">将 GitHub Release 的下载文件备份到 WebDAV 云盘，防止上游删库导致资源丢失。每个项目保留最近 2 次更新。</p>

      <NAlert v-if="!isDev" type="warning" :bordered="false" class="dev-alert" :show-icon="false">
        <strong>注意：</strong>WebDAV 备份功能需要本地开发服务器支持，GitHub Pages 上仅可保存配置。如需使用完整备份功能，请在本地运行 <code>npm run dev</code>。
      </NAlert>

      <div class="settings-card">
        <h3 class="card-title">⚙️ WebDAV 配置</h3>
        <div class="webdav-grid">
          <div class="field">
            <label>WebDAV 地址</label>
            <NInput v-model:value="webdavForm.url" placeholder="如 https://example.com/dav/" />
          </div>
          <div class="field">
            <label>用户名</label>
            <NInput v-model:value="webdavForm.username" placeholder="用户名" />
          </div>
          <div class="field">
            <label>密码</label>
            <NInput v-model:value="webdavForm.password" type="password" placeholder="留空则不修改" show-password-on="click" />
          </div>
          <div class="field">
            <label>备份路径</label>
            <NInput v-model:value="webdavForm.baseDir" placeholder="/SoftwareHub" />
          </div>
        </div>
        <div class="webdav-extras">
          <div class="field-inline">
            <label>上传超时</label>
            <NInputNumber v-model:value="webdavForm.uploadTimeout" :min="10" :max="1800" />
            <span class="hint-text">秒（默认300秒，大文件请加长）</span>
          </div>
          <div class="field-inline">
            <label>文件限制</label>
            <NInputNumber v-model:value="webdavForm.maxFileSize" :min="1" :max="10000" />
            <span class="hint-text">MB（默认500MB，超过此大小的文件跳过不备份）</span>
          </div>
        </div>
        <div class="card-actions">
          <button class="btn-primary" :disabled="!webdavForm.url" @click="saveWebdavConfig">保存配置</button>
          <button class="btn-secondary" :disabled="!webdavForm.url || webdavTesting" @click="testWebdavConnection">
            {{ webdavTesting ? '测试中...' : '测试连接' }}
          </button>
          <span v-if="webdavTested" class="hint-text hint-success">✓ 连接正常</span>
        </div>
      </div>

      <div class="settings-card">
        <h3 class="card-title">🚀 开始备份</h3>
        <div class="backup-intro">
          <div class="intro-icon">☁️</div>
          <div class="intro-content">
            <h4 class="intro-title">开始将本地文件备份到 WebDAV 云盘</h4>
            <p class="intro-desc">备份过程可能需要一些时间，请耐心等待</p>
          </div>
        </div>
        <div class="card-actions">
          <button
            class="btn-primary"
            :disabled="backingUp && !paused"
            @click="doBackup"
          >
            {{ backingUp ? (paused ? '已暂停' : '备份中...') : '开始备份' }}
          </button>
          <button v-if="backingUp" class="btn-secondary" @click="togglePause">
            {{ paused ? '▶ 继续' : '⏸ 暂停' }}
          </button>
        </div>
        <div v-if="backingUp && backupTotal > 0" class="progress-wrap">
          <NProgress
            type="line"
            :percentage="Math.round(backupDone / backupTotal * 100)"
            :fill-bar-color="paused ? '#f0a020' : undefined"
            :height="14"
            :border-radius="4"
          >
            <span class="progress-label">{{ backupDone }} / {{ backupTotal }} 版本</span>
          </NProgress>
        </div>
        <details v-if="logs.length" class="log-details" :open="backingUp">
          <summary class="log-summary">日志 ({{ logs.length }})</summary>
          <div class="log-list">
            <div v-for="(log, i) in logs" :key="i" class="log-item">
              <NTag :type="logTagType(log.type)" size="small" round>{{ humanType(log.type) }}</NTag>
              <span class="log-msg">{{ log.project ? `[${log.project}] ` : '' }}{{ log.file ? `${log.file} — ` : '' }}{{ log.message }}</span>
            </div>
          </div>
        </details>
      </div>

      <details class="files-panel">
        <summary class="files-panel-summary">
          <span>📁 已备份的文件</span>
          <span class="files-panel-count" v-if="!loadingFiles">{{ backupEntries.length }} 个项目 / {{ backupEntries.reduce((s, e) => s + e.files.length, 0) }} 个文件</span>
          <span v-else class="hint-text">加载中...</span>
        </summary>
        <div class="files-panel-body">
          <div v-if="backupEntries.length === 0 && !loadingFiles" class="empty-state">暂无备份文件</div>
          <div v-for="(group, gi) in projectGroups" :key="gi" class="project-group">
            <div class="group-header">
              <span class="group-category">{{ group.category }}</span>
              <span class="group-sep">/</span>
              <span class="group-project">{{ group.project }}</span>
              <span class="group-count">{{ group.totalFiles }} 个文件</span>
            </div>
            <div v-for="(entry, i) in group.versions" :key="i" class="version-block">
              <div class="version-header">
                <div class="version-info">
                  <span class="version-label">📦 {{ entry.versionDir }}</span>
                </div>
                <NPopconfirm positive-text="确认删除" negative-text="取消" @positive-click="confirmDeleteVersion(entry)">
                  <template #trigger>
                    <button class="btn-text-danger" :disabled="deletingPaths.has(`${entry.category}/${entry.project}/${entry.versionDir}/`)">删除整个版本</button>
                  </template>
                  确定要删除版本「{{ entry.versionDir }}」的所有文件吗？
                </NPopconfirm>
              </div>
              <div class="files-grid">
                <div v-for="(f, j) in entry.files" :key="j" class="file-item">
                  <a :href="f.url" class="file-link" download target="_blank">
                    📄 {{ f.name }}
                    <span class="file-size">({{ formatSize(f.size) }})</span>
                  </a>
                  <NPopconfirm positive-text="确认删除" negative-text="取消" @positive-click="confirmDeleteFile(entry, f)">
                    <template #trigger>
                      <button class="btn-text-danger" :disabled="deletingPaths.has(`${entry.category}/${entry.project}/${entry.versionDir}/${f.name}`)">删除</button>
                    </template>
                    确定要删除文件「{{ f.name }}」吗？
                  </NPopconfirm>
                </div>
              </div>
            </div>
          </div>
        </div>
      </details>
    </div>
  </AdminLayout>
</template>

<style scoped>
.backup-scroll { overflow-y: auto; flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 16px; }
.page-title { margin: 0; font-size: 1.4rem; font-weight: 700; color: var(--text-main); }
.page-desc { font-size: 0.88rem; color: var(--text-tertiary); margin: 0 0 4px; line-height: 1.5; }

.dev-alert { background: rgba(240, 160, 32, 0.08) !important; border-color: rgba(240, 160, 32, 0.2) !important; }
.dev-alert code { font-family: var(--font-mono); background: var(--color-card); padding: 1px 6px; border-radius: 4px; }

.settings-card {
  background: var(--color-card);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 24px;
}
.card-title { font-size: 1.05rem; font-weight: 700; color: var(--text-main); margin: 0 0 16px; }

.webdav-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.field { display: flex; flex-direction: column; }
.field label { font-size: 0.85rem; font-weight: 600; color: var(--text-sec); margin-bottom: 6px; }
.webdav-extras { display: flex; flex-wrap: wrap; gap: 24px; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-soft); }
.field-inline { display: flex; align-items: center; gap: 8px; }
.field-inline label { font-size: 0.85rem; font-weight: 600; color: var(--text-sec); }
.hint-text { font-size: 0.78rem; color: var(--text-tertiary); }
.hint-success { color: var(--color-success); font-weight: 500; }

.card-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 16px; }

.backup-intro {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  background: var(--color-card-soft);
  border-radius: var(--radius-md);
  margin-bottom: 12px;
}
.intro-icon {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  background: var(--gradient-primary-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
  flex-shrink: 0;
}
.intro-content { flex: 1; }
.intro-title { font-size: 0.95rem; font-weight: 600; color: var(--text-main); margin: 0 0 2px; }
.intro-desc { font-size: 0.82rem; color: var(--text-tertiary); margin: 0; }

.progress-wrap { margin-top: 16px; }
.progress-label { font-size: 0.8rem; white-space: nowrap; color: var(--text-main); font-weight: 600; }

.log-details { margin-top: 12px; }
.log-summary { font-size: 0.85rem; cursor: pointer; color: var(--text-sec); user-select: none; padding: 6px 0; font-weight: 500; }
.log-summary:hover { color: var(--text-main); }
.log-list { margin-top: 12px; max-height: 300px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
.log-item { display: flex; align-items: center; gap: 8px; font-size: 0.85rem; }
.log-msg { color: var(--text-sec); }

.files-panel {
  background: var(--color-card);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}
.files-panel-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  cursor: pointer;
  user-select: none;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-main);
  list-style: none;
}
.files-panel-summary::-webkit-details-marker { display: none; }
.files-panel-summary::before { content: '▶'; font-size: 0.7rem; transition: transform 0.15s; color: var(--text-tertiary); margin-right: 4px; }
.files-panel[open] > .files-panel-summary::before { transform: rotate(90deg); }
.files-panel-summary:hover { background: var(--color-card-soft); }
.files-panel-count { margin-left: auto; font-size: 0.8rem; font-weight: 400; color: var(--text-tertiary); }
.files-panel-body { padding: 12px 20px 20px; border-top: 1px solid var(--border-soft); }
.empty-state { text-align: center; padding: 40px 0; color: var(--text-tertiary); }

.project-group { margin-bottom: 16px; }
.project-group:last-child { margin-bottom: 0; }
.group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: var(--color-card-soft);
  border-radius: var(--radius-md);
  font-size: 0.9rem;
  font-weight: 600;
  margin-bottom: 8px;
}
.group-category { color: var(--color-primary); }
.group-sep, .group-project { color: var(--text-main); }
.group-count { margin-left: auto; font-size: 0.78rem; font-weight: 400; color: var(--text-tertiary); }

.version-block { margin-bottom: 12px; padding: 12px; background: var(--color-card-soft); border-radius: var(--radius-md); border: 1px solid var(--border-soft); }
.version-block:last-child { margin-bottom: 0; }
.version-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.version-label { font-size: 0.88rem; font-weight: 600; color: var(--text-main); }
.files-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.file-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  background: var(--color-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  font-size: 0.82rem;
}
.file-link { color: var(--text-main); text-decoration: none; }
.file-link:hover { color: var(--color-primary); }
.file-size { color: var(--text-tertiary); font-size: 0.75rem; }

.btn-text-danger {
  background: none; border: none; color: var(--text-tertiary);
  font-size: 0.78rem; cursor: pointer; padding: 2px 6px; border-radius: 4px;
  transition: color 0.18s, background 0.18s;
}
.btn-text-danger:hover:not(:disabled) { color: var(--color-error); background: rgba(255, 107, 107, 0.08); }
.btn-text-danger:disabled { opacity: 0.4; cursor: not-allowed; }

@media (max-width: 768px) {
  .webdav-grid { grid-template-columns: 1fr; }
  .webdav-extras { flex-direction: column; gap: 12px; }
  .field-inline { flex-wrap: wrap; }
}
</style>
