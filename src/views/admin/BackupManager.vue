<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { NButton, NCard, NSpin, NSpace, NEmpty, NTag, NPopconfirm, NProgress, NInput, NAlert, useMessage } from 'naive-ui'
import AdminLayout from '../../components/admin/AdminLayout.vue'
import { useProjectStore } from '../../store/project'
import { useCategoryStore } from '../../store/category'
import { useSettingStore } from '../../store/settings'

interface LogEntry {
  type: string
  project?: string
  version?: string
  file?: string
  message: string
}

interface BackupFileEntry {
  category: string
  project: string
  versionDir: string
  files: { name: string; size: number; url: string }[]
}

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
})
const webdavTesting = ref(false)
const webdavTested = ref(false)
const isDev = import.meta.env.DEV

async function loadWebdavConfig() {
  /* 先从 localStorage 加载 */
  const wd = settings.settings.webdav
  if (wd) {
    webdavForm.value = {
      url: wd.url || '',
      username: wd.username || '',
      password: '',
      baseDir: wd.baseDir || '/SoftwareHub',
    }
  }
  /* 本地开发时再从服务端加载（覆盖密码） */
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
        }
      }
    } catch { /* ignore */ }
  }
}

async function saveWebdavConfig() {
  /* 存到 localStorage */
  const s = { ...settings.settings }
  const storedPwd = s.webdav?.password || ''
  s.webdav = {
    url: webdavForm.value.url,
    username: webdavForm.value.username,
    password: webdavForm.value.password || storedPwd,
    baseDir: webdavForm.value.baseDir,
  }
  settings.save(s)

  /* 本地开发时再同步到服务端 */
  if (isDev) {
    try {
      const res = await fetch('/__backup-webdav-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s.webdav),
      })
      const data = await res.json()
      if (data.success) {
        webdavTested.value = false
      }
    } catch { /* ignore */ }
  }
  message.success('WebDAV 配置已保存')
}

async function testWebdavConnection() {
  webdavTesting.value = true
  try {
    // 先保存配置到服务端，然后请求文件列表来测试连通性
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

// 按项目分组，方便折叠显示
interface ProjectGroup {
  category: string
  project: string
  versions: BackupFileEntry[]
  totalFiles: number
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
    const res = await fetch('/__backup-files')
    const data = await res.json()
    backupEntries.value = data.entries || []
  } catch {
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

    const ghProjects = projects.projects.filter(
      (p) => p.sourceType === 'github' && p.versions.length > 0,
    )
    if (ghProjects.length === 0) {
      logs.value.push({ type: 'meta', message: '没有需要备份的 GitHub 项目' })
      backingUp.value = false
      return
    }

    logs.value.push({ type: 'meta', message: `找到 ${ghProjects.length} 个 GitHub 项目` })

    const backupData = ghProjects.map((p) => ({
      categoryName: categories.categories.find((c) => c.id === p.categoryId)?.name || '未分类',
      projectName: p.name,
      projectId: p.id,
      versions: p.versions.map((v) => ({
        version: v.version,
        publishedAt: v.publishedAt,
        downloads: v.downloads.map((d) => ({
          filename: d.filename,
          url: d.url,
        })),
      })),
    }))

    const totalVersionCount = backupData.reduce((s, p) => s + p.versions.length, 0)
    logs.value.push({ type: 'meta', message: `共 ${totalVersionCount} 个版本待处理` })

    const proxyEnabled = settings.settings.ghProxyEnabled ?? false
    const proxyUrl = settings.settings.ghProxyUrl || ''
    const useProxy = proxyEnabled && proxyUrl
    const requestBody: any = { projects: backupData }
    if (useProxy) {
      requestBody.ghProxy = proxyUrl
    }

    let refreshTimer: ReturnType<typeof setInterval> | null = null
    refreshTimer = setInterval(() => {
      if (!loadingFiles.value) loadBackupFiles()
    }, 3000)

    try {
      // 先确保服务端有最新的 WebDAV 配置
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
          } catch {
            // skip malformed lines
          }
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

interface DeleteItem {
  category: string
  project: string
  versionDir: string
  filename?: string
}

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
      if (fail.length === 0) {
        message.success(`已删除 ${ok} 个${label}`)
      } else {
        message.warning(`删除了 ${ok} 个，${fail.length} 个失败`)
        fail.forEach((r: any) => message.error(`${r.path}: ${r.error}`))
      }
      loadBackupFiles()
    } else {
      message.error(`删除失败: ${data.error}`)
    }
  } catch (e: any) {
    message.error(`请求失败: ${e.message}`)
  }

  const next = new Set(deletingPaths.value)
  for (const k of keys) next.delete(k)
  deletingPaths.value = next
}

function confirmDeleteFile(entry: BackupFileEntry, file: { name: string }) {
  deleteItems([{
    category: entry.category,
    project: entry.project,
    versionDir: entry.versionDir,
    filename: file.name,
  }], `文件 ${file.name}`)
}

function confirmDeleteVersion(entry: BackupFileEntry) {
  deleteItems([{
    category: entry.category,
    project: entry.project,
    versionDir: entry.versionDir,
  }], `版本 ${entry.versionDir}`)
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

      <NAlert v-if="!isDev" type="warning" :bordered="false" style="margin-bottom:16px">
        <strong>注意：</strong>WebDAV 备份功能需要本地开发服务器支持，GitHub Pages 上仅可保存配置。
        如需使用完整备份功能，请在本地运行 <code>npm run dev</code>。
      </NAlert>

      <NCard title="WebDAV 配置" class="action-card" style="margin-bottom: 16px">
        <div class="webdav-grid">
          <NInput v-model:value="webdavForm.url" placeholder="WebDAV 地址 (如 https://example.com/dav/)" />
          <NInput v-model:value="webdavForm.username" placeholder="用户名" />
          <NInput v-model:value="webdavForm.password" type="password" placeholder="密码 (留空则不修改)" />
          <NInput v-model:value="webdavForm.baseDir" placeholder="根目录 (如 /SoftwareHub)" />
        </div>
        <div class="action-row" style="margin-top: 12px">
          <NButton type="primary" @click="saveWebdavConfig" :disabled="!webdavForm.url">保存配置</NButton>
          <NButton @click="testWebdavConnection" :loading="webdavTesting" :disabled="!webdavForm.url">测试连接</NButton>
          <span v-if="webdavTested" class="hint-text" style="color:var(--accent-teal)">✓ 连接正常</span>
        </div>
      </NCard>

      <NCard title="开始备份" class="action-card">
        <div class="action-row">
          <NButton
            type="warning"
            :loading="backingUp && !paused"
            :disabled="backingUp && !paused"
            @click="doBackup"
          >
            {{ backingUp ? (paused ? '已暂停' : '备份中...') : '开始备份' }}
          </NButton>
          <NButton
            v-if="backingUp"
            :type="paused ? 'success' : 'warning'"
            ghost
            @click="togglePause"
          >
            {{ paused ? '▶ 继续' : '⏸ 暂停' }}
          </NButton>
          <span v-if="backingUp && !paused" class="hint-text">正在处理...</span>
          <span v-if="paused" class="hint-text hint-paused">已暂停</span>
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
            <div
              v-for="(log, i) in logs"
              :key="i"
              class="log-item"
            >
              <NTag :type="logTagType(log.type)" size="small">
                {{ humanType(log.type) }}
              </NTag>
              <span class="log-msg">{{ log.project ? `[${log.project}] ` : '' }}{{ log.file ? `${log.file} — ` : '' }}{{ log.message }}</span>
            </div>
          </div>
        </details>
      </NCard>

      <details class="files-panel">
        <summary class="files-panel-summary">
          <span>📁 已备份的文件</span>
          <span class="files-panel-count" v-if="!loadingFiles">{{ backupEntries.length }} 个项目 / {{ backupEntries.reduce((s, e) => s + e.files.length, 0) }} 个文件</span>
          <NSpin v-else :size="16" />
        </summary>
        <div class="files-panel-body">
          <div v-if="backupEntries.length === 0 && !loadingFiles" class="empty-wrap">
            <NEmpty description="暂无备份文件" />
          </div>
          <div v-for="(group, gi) in projectGroups" :key="gi" class="project-group">
            <details class="project-details">
              <summary class="project-summary">
                <span class="group-category">{{ group.category }}</span>
                <span class="group-sep">/</span>
                <span class="group-project">{{ group.project }}</span>
                <span class="group-count">{{ group.totalFiles }} 个文件</span>
              </summary>
              <div class="project-versions">
                <div v-for="(entry, i) in group.versions" :key="i" class="backup-group">
                  <div class="backup-group-header">
                    <div class="group-path">
                      <span class="group-version">{{ entry.versionDir }}</span>
                    </div>
                    <NPopconfirm positive-text="确认删除" negative-text="取消" @positive-click="confirmDeleteVersion(entry)">
                      <template #trigger>
                        <NButton size="tiny" type="error" quaternary :loading="deletingPaths.has(`${entry.category}/${entry.project}/${entry.versionDir}/`)">
                          删除整个版本
                        </NButton>
                      </template>
                      确定要删除版本「{{ entry.versionDir }}」的所有文件吗？
                    </NPopconfirm>
                  </div>
                  <div class="backup-files">
                    <div
                      v-for="(f, j) in entry.files"
                      :key="j"
                      class="backup-file-item"
                    >
                      <a
                        :href="f.url"
                        class="backup-file-link"
                        download
                      >
                        📄 {{ f.name }}
                        <span class="file-size">({{ formatSize(f.size) }})</span>
                      </a>
                      <NPopconfirm positive-text="确认删除" negative-text="取消" @positive-click="confirmDeleteFile(entry, f)">
                  <template #trigger>
                    <NButton
                      size="tiny"
                      type="error"
                      quaternary
                      :loading="deletingPaths.has(`${entry.category}/${entry.project}/${entry.versionDir}/${f.name}`)"
                      class="delete-btn"
                    >
                      删除
                    </NButton>
                  </template>
                  确定要删除文件「{{ f.name }}」吗？
                </NPopconfirm>
              </div>
            </div>
          </div>
            </div>
          </details>
        </div>
        </div>
      </details>
    </div>
  </AdminLayout>
</template>

<style scoped>
.page-title { margin: 0 0 8px; font-size: 1.3rem; }
.page-desc { font-size: 0.9rem; color: var(--text-sec); margin-bottom: 20px; }

.action-card { margin-top: 0; }
.action-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.hint-text { font-size: 0.85rem; color: var(--text-sec); }
.webdav-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.hint-paused { color: var(--accent-orange, #f0a020); font-weight: 600; }

.progress-wrap { margin-top: 16px; }
.progress-label { font-size: 0.8rem; white-space: nowrap; }

.log-details { margin-top: 12px; }
.log-summary {
  font-size: 0.85rem;
  cursor: pointer;
  color: var(--text-sec);
  user-select: none;
  padding: 4px 0;
}
.log-summary:hover { color: var(--text-main); }

.log-list {
  margin-top: 16px;
  max-height: 360px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.log-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
}
.log-msg { color: var(--text-sec); }

.files-panel {
  margin-top: 16px;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  background: var(--card-bg);
}
.files-panel-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  user-select: none;
  font-size: 0.95rem;
  font-weight: 600;
  border-radius: var(--border-radius);
}
.files-panel-summary:hover { background: var(--hover-bg); }
.files-panel-summary::-webkit-details-marker { display: none; }
.files-panel-summary::before { content: '▶'; font-size: 0.75rem; transition: transform 0.15s; color: var(--text-sec); margin-right: 4px; }
.files-panel[open] > .files-panel-summary::before { transform: rotate(90deg); }
.files-panel-count { margin-left: auto; font-size: 0.8rem; font-weight: 400; color: var(--text-sec); }
.files-panel-body { padding: 8px 16px 16px; border-top: 1px solid var(--border-color); }
.empty-wrap { padding: 32px 0; }

.backup-group {
  margin-bottom: 14px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border-color);
}
.backup-group:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}
.project-group { margin-bottom: 16px; }
.project-details { border: 1px solid var(--border-color); border-radius: var(--border-radius); }
.project-summary {
  padding: 10px 12px;
  cursor: pointer;
  user-select: none;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--card-bg);
  border-radius: var(--border-radius);
}
.project-summary:hover { background: var(--hover-bg); }
.project-summary::-webkit-details-marker { display: none; }
.project-summary::before { content: '▶'; font-size: 0.75rem; transition: transform 0.15s; color: var(--text-sec); }
.project-details[open] > .project-summary::before { transform: rotate(90deg); }
.group-count { margin-left: auto; font-size: 0.8rem; color: var(--text-sec); }
.project-versions { padding: 8px 12px 4px; }

.backup-group-header {
  font-size: 0.9rem;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.group-path { display: flex; align-items: center; gap: 4px; flex: 1; min-width: 0; }
.group-category { color: var(--primary-color); font-weight: 600; }
.group-project { font-weight: 600; }
.group-sep { color: var(--text-sec); }
.group-version { color: var(--text-sec); font-size: 0.85rem; }

.backup-files {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.backup-file-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  transition: background 0.15s;
}
.backup-file-item:hover { background: var(--hover-bg); }
.backup-file-link {
  font-size: 0.85rem;
  color: var(--text-main);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.delete-btn { flex-shrink: 0; }
.file-size { color: var(--text-sec); font-size: 0.8rem; }

.backup-scroll { overflow-y: auto; flex: 1; min-height: 0; }
</style>
