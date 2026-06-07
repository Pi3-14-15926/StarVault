<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { NModal, NAlert, useMessage } from 'naive-ui'
import AdminLayout from '../../components/admin/AdminLayout.vue'
import AdminSearchBar from '../../components/admin/AdminSearchBar.vue'
import { useSettingStore } from '../../store/settings'

interface BackupFile {
  name: string
  size: number
  url: string
}
interface BackupEntry {
  category: string
  project: string
  versionDir: string
  files: BackupFile[]
}
interface ProjectGroup {
  category: string
  project: string
  versions: BackupEntry[]
  totalFiles: number
  totalSize: number
}
interface DeleteItem { category: string; project: string; versionDir: string; filename?: string }

const message = useMessage()
const settings = useSettingStore()

const entries = ref<BackupEntry[]>([])
const loading = ref(false)
const deletingPaths = ref<Set<string>>(new Set())
const expandedProjects = ref<Set<string>>(new Set())
const keyword = ref('')
const dataSource = ref<'webdav' | 'manifest' | 'none'>('none')
const configMissing = ref(false)

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + units[i]
}

const isDev = import.meta.env.DEV

async function syncWebdavConfigToServer(): Promise<boolean> {
  if (!isDev) return false
  const wd = settings.settings.webdav
  if (!wd || !wd.url || !wd.username || !wd.password) return false
  try {
    const res = await fetch('/__backup-webdav-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(wd),
    })
    return res.ok
  } catch {
    return false
  }
}

async function loadFromWebdav(): Promise<BackupEntry[]> {
  try {
    const res = await fetch('/__backup-files')
    if (!res.ok) return []
    const data = await res.json()
    return data.entries || []
  } catch {
    return []
  }
}

async function loadFromManifest(): Promise<BackupEntry[]> {
  try {
    const manifestUrl = import.meta.env.BASE_URL + 'data/backup-manifest.json'
    const res = await fetch(manifestUrl)
    if (!res.ok) return []
    const data = await res.json()
    return data.entries || []
  } catch {
    return []
  }
}

async function loadFiles() {
  loading.value = true
  configMissing.value = false
  await settings.refresh()

  const synced = await syncWebdavConfigToServer()

  if (isDev) {
    const list = await loadFromWebdav()
    if (list.length > 0) {
      entries.value = list
      dataSource.value = 'webdav'
      loading.value = false
      return
    }
    if (!synced) {
      const wd = settings.settings.webdav
      if (!wd || !wd.url || !wd.username) configMissing.value = true
    }
  }

  const manifestList = await loadFromManifest()
  if (manifestList.length > 0) {
    entries.value = manifestList
    dataSource.value = 'manifest'
    loading.value = false
    return
  }

  entries.value = []
  dataSource.value = 'none'
  loading.value = false
}

const projectGroups = computed<ProjectGroup[]>(() => {
  const map = new Map<string, ProjectGroup>()
  for (const e of entries.value) {
    const key = `${e.category}||${e.project}`
    if (!map.has(key)) map.set(key, { category: e.category, project: e.project, versions: [], totalFiles: 0, totalSize: 0 })
    const group = map.get(key)!
    group.versions.push(e)
    group.totalFiles += e.files.length
    group.totalSize += e.files.reduce((s, f) => s + (f.size || 0), 0)
  }
  return Array.from(map.values())
})

const filteredGroups = computed(() => {
  if (!keyword.value.trim()) return projectGroups.value
  const kw = keyword.value.toLowerCase()
  return projectGroups.value
    .map((g) => {
      const versions = g.versions
        .map((v) => ({
          ...v,
          files: v.files.filter((f) => f.name.toLowerCase().includes(kw)),
        }))
        .filter((v) => v.files.length > 0 || v.versionDir.toLowerCase().includes(kw))
      if (versions.length === 0 && !g.project.toLowerCase().includes(kw) && !g.category.toLowerCase().includes(kw)) return null
      return { ...g, versions }
    })
    .filter(Boolean) as ProjectGroup[]
})

const totalFiles = computed(() => entries.value.reduce((s, e) => s + e.files.length, 0))
const totalSize = computed(() => entries.value.reduce((s, e) => s + e.files.reduce((ss, f) => ss + (f.size || 0), 0), 0))
const totalProjects = computed(() => projectGroups.value.length)
const allExpanded = computed(() => {
  if (filteredGroups.value.length === 0) return false
  return filteredGroups.value.every((p) => expandedProjects.value.has(`${p.category}/${p.project}`))
})

function toggleProject(p: ProjectGroup) {
  const key = `${p.category}/${p.project}`
  if (expandedProjects.value.has(key)) expandedProjects.value.delete(key)
  else expandedProjects.value.add(key)
}
function expandAll() {
  for (const p of filteredGroups.value) expandedProjects.value.add(`${p.category}/${p.project}`)
}
function collapseAll() {
  expandedProjects.value.clear()
}
function toggleExpandAll() {
  if (allExpanded.value) collapseAll()
  else expandAll()
}

function fileExt(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}
function fileIconColor(ext: string): string {
  if (['zip', 'rar', '7z', 'tar', 'gz', 'tgz'].includes(ext)) return '#3478F6'
  if (['exe', 'msi', 'dmg', 'pkg', 'deb', 'rpm'].includes(ext)) return '#8C6CFF'
  if (['pdf'].includes(ext)) return '#E55353'
  if (['txt', 'md', 'log'].includes(ext)) return '#6B7280'
  if (['json', 'xml', 'yml', 'yaml'].includes(ext)) return '#3CB371'
  return '#9CA3AF'
}

async function deleteItems(items: DeleteItem[], label: string) {
  const keys = items.map((i) => `${i.category}/${i.project}/${i.versionDir}/${i.filename || ''}`)
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
      await loadFiles()
    } else { message.error(`删除失败: ${data.error}`) }
  } catch (e: any) { message.error(`请求失败: ${e.message}`) }
  const next = new Set(deletingPaths.value)
  for (const k of keys) next.delete(k)
  deletingPaths.value = next
}

function deleteFile(p: ProjectGroup, v: BackupEntry, f: BackupFile) {
  deleteItems([{ category: p.category, project: p.project, versionDir: v.versionDir, filename: f.name }], `文件 ${f.name}`)
}
function deleteVersion(p: ProjectGroup, v: BackupEntry) {
  deleteItems([{ category: p.category, project: p.project, versionDir: v.versionDir }], `版本 ${v.versionDir}`)
}
function deleteProject(p: ProjectGroup) {
  const items: DeleteItem[] = []
  for (const v of p.versions) {
    for (const f of v.files) {
      items.push({ category: p.category, project: p.project, versionDir: v.versionDir, filename: f.name })
    }
  }
  deleteItems(items, `项目 ${p.project} 的所有备份`)
}

/* ========== 删除确认弹窗 ========== */
const showProjectDeleteModal = ref(false)
const projectToDelete = ref<ProjectGroup | null>(null)
const showVersionDeleteModal = ref(false)
const versionToDelete = ref<{ p: ProjectGroup; v: BackupEntry } | null>(null)
const showFileDeleteModal = ref(false)
const fileToDelete = ref<{ p: ProjectGroup; v: BackupEntry; f: BackupFile } | null>(null)
function confirmDeleteProject() {
  if (!projectToDelete.value) return
  deleteProject(projectToDelete.value)
  showProjectDeleteModal.value = false
  projectToDelete.value = null
}
function confirmDeleteVersion() {
  if (!versionToDelete.value) return
  deleteVersion(versionToDelete.value.p, versionToDelete.value.v)
  showVersionDeleteModal.value = false
  versionToDelete.value = null
}
function confirmDeleteFile() {
  if (!fileToDelete.value) return
  deleteFile(fileToDelete.value.p, fileToDelete.value.v, fileToDelete.value.f)
  showFileDeleteModal.value = false
  fileToDelete.value = null
}

onMounted(() => { loadFiles() })
</script>

<template>
  <AdminLayout>
    <div class="files-scroll">
      <!-- 页面头部 -->
      <div class="page-head">
        <div>
          <h2 class="page-title"><span class="page-title-emoji">📁</span>备份文件</h2>
          <p class="page-desc">浏览、下载、删除已备份到 WebDAV 云盘的文件</p>
        </div>
        <div class="head-actions">
          <button class="btn-ghost" @click="loadFiles" :disabled="loading">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" :class="{ spinning: loading }">
              <polyline points="23 4 23 10 17 10"/>
              <polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            刷新
          </button>
          <button class="btn-secondary" @click="toggleExpandAll" :disabled="filteredGroups.length === 0">
            {{ allExpanded ? '全部折叠' : '全部展开' }}
          </button>
        </div>
      </div>

      <!-- 顶部 3 张统计卡 -->
      <div class="stats-row">
        <div class="stat-card stat-blue">
          <div class="stat-glow"></div>
          <div class="stat-icon">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ totalProjects }}</div>
            <div class="stat-label">项目数</div>
          </div>
        </div>
        <div class="stat-card stat-purple">
          <div class="stat-glow"></div>
          <div class="stat-icon">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
              <polyline points="13 2 13 9 20 9"/>
            </svg>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ totalFiles }}</div>
            <div class="stat-label">文件总数</div>
          </div>
        </div>
        <div class="stat-card stat-green">
          <div class="stat-glow"></div>
          <div class="stat-icon">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <ellipse cx="12" cy="5" rx="9" ry="3"/>
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
            </svg>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ formatSize(totalSize) }}</div>
            <div class="stat-label">占用空间</div>
          </div>
        </div>
      </div>

      <!-- 配置缺失提示 -->
      <NAlert
        v-if="configMissing"
        type="warning"
        :show-icon="true"
        title="WebDAV 未配置"
        class="config-alert"
      >
        <template #icon>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </template>
        <div class="alert-body">
          <span>当前 dev server 中没有 WebDAV 连接信息，备份列表可能为空。</span>
          <span>请先在服务端配置 WebDAV 连接信息后再访问。</span>
        </div>
      </NAlert>

      <!-- 数据来源指示 -->
      <div v-if="dataSource !== 'none'" class="source-bar">
        <span class="source-dot" :class="`dot-${dataSource}`"></span>
        <span class="source-text">
          数据来源：
          <strong v-if="dataSource === 'webdav'">WebDAV 实时（dev 端点）</strong>
          <strong v-else>静态 manifest（GitHub Action 生成）</strong>
        </span>
      </div>

      <!-- 搜索框 -->
      <div class="search-row">
        <AdminSearchBar
          v-model="keyword"
          placeholder="搜索项目名 / 版本 / 文件名..."
          width="100%"
        />
        <span v-if="filteredGroups.length !== projectGroups.length" class="search-result-count">
          {{ filteredGroups.length }} / {{ projectGroups.length }}
        </span>
      </div>

      <!-- 列表 -->
      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <p>正在加载备份列表...</p>
      </div>
      <div v-else-if="filteredGroups.length === 0" class="empty-state">
        <div class="empty-illust">
          <svg viewBox="0 0 120 120" width="96" height="96" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="20" y="30" width="80" height="64" rx="8" fill="rgba(52, 120, 246, 0.08)"/>
            <path d="M20 30 L48 30 L56 38 L100 38 L100 86 L20 86 Z" fill="rgba(140, 108, 255, 0.12)"/>
            <line x1="36" y1="56" x2="84" y2="56" opacity="0.4"/>
            <line x1="36" y1="68" x2="72" y2="68" opacity="0.4"/>
            <line x1="36" y1="80" x2="60" y2="80" opacity="0.4"/>
          </svg>
        </div>
        <h3 class="empty-title">
          <span v-if="keyword">没有匹配 "{{ keyword }}" 的备份文件</span>
          <span v-else-if="configMissing">WebDAV 尚未配置</span>
          <span v-else-if="dataSource === 'webdav'">WebDAV 已连接，暂无备份</span>
          <span v-else>暂无备份文件</span>
        </h3>
        <p class="empty-desc">
          <span v-if="keyword">试试调整搜索关键词，或清空搜索查看全部</span>
          <span v-else-if="configMissing">请先在服务端配置 WebDAV 连接信息</span>
          <span v-else>暂无备份文件</span>
        </p>
        <button v-if="keyword" class="btn-secondary" @click="keyword = ''">清空搜索</button>
      </div>

      <div v-else class="project-list">
        <article
          v-for="p in filteredGroups"
          :key="`${p.category}/${p.project}`"
          class="proj-card"
        >
          <!-- 项目头部 -->
          <header class="proj-head" @click="toggleProject(p)">
            <div class="proj-head-left">
              <div class="proj-icon">{{ p.project[0]?.toUpperCase() || '?' }}</div>
              <div class="proj-info">
                <div class="proj-name-row">
                  <span class="proj-name">{{ p.project }}</span>
                  <span class="proj-cat-chip">
                    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                      <line x1="7" y1="7" x2="7.01" y2="7"/>
                    </svg>
                    {{ p.category }}
                  </span>
                </div>
                <div class="proj-meta">
                  <span class="meta-item">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                    </svg>
                    {{ p.versions.length }} 个版本
                  </span>
                  <span class="meta-dot">·</span>
                  <span class="meta-item">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                    {{ p.totalFiles }} 个文件
                  </span>
                  <span class="meta-dot">·</span>
                  <span class="meta-item">{{ formatSize(p.totalSize) }}</span>
                </div>
              </div>
            </div>
            <div class="proj-head-right" @click.stop>
              <button class="btn-danger-soft" :disabled="deletingPaths.has(`${p.category}/${p.project}/`)" @click="projectToDelete = p; showProjectDeleteModal = true">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                全部删除
              </button>
              <span class="caret" :class="{ open: expandedProjects.has(`${p.category}/${p.project}`) }">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </span>
            </div>
          </header>

          <!-- 展开：每个版本一张卡 -->
          <div v-if="expandedProjects.has(`${p.category}/${p.project}`)" class="version-list">
            <div v-for="v in p.versions" :key="v.versionDir" class="version-card">
              <div class="version-head">
                <div class="version-info">
                  <span class="version-tag">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                      <line x1="12" y1="22.08" x2="12" y2="12"/>
                    </svg>
                    {{ v.versionDir }}
                  </span>
                  <span class="version-meta">{{ v.files.length }} 个文件</span>
                </div>
                <button class="btn-text-danger" :disabled="deletingPaths.has(`${p.category}/${p.project}/${v.versionDir}/`)" @click="versionToDelete = { p, v }; showVersionDeleteModal = true">
                  删除版本
                </button>
              </div>
              <ul class="file-list">
                <li v-for="f in v.files" :key="f.name" class="file-item">
                  <a :href="f.url" target="_blank" rel="noopener noreferrer" class="file-link" :title="f.name">
                    <span class="file-icon" :style="{ background: fileIconColor(fileExt(f.name)) + '22', color: fileIconColor(fileExt(f.name)) }">
                      {{ (fileExt(f.name) || 'file').slice(0, 3).toUpperCase() }}
                    </span>
                    <span class="file-name">{{ f.name }}</span>
                    <span class="file-size">{{ formatSize(f.size) }}</span>
                    <span class="file-download" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                      </svg>
                    </span>
                  </a>
                  <button class="btn-text-danger file-del" :disabled="deletingPaths.has(`${p.category}/${p.project}/${v.versionDir}/${f.name}`)" @click="fileToDelete = { p, v, f }; showFileDeleteModal = true">
                    删除
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </article>
      </div>
    </div>

    <!-- 删除项目确认弹窗 -->
    <NModal v-model:show="showProjectDeleteModal" preset="card" title="删除项目" style="max-width: 460px; border-radius: var(--admin-radius-card);" :mask-closable="false">
      <div class="del-modal-body">
        <div class="del-modal-icon">🗑</div>
        <p class="del-modal-title">确定删除项目 <strong>{{ projectToDelete?.project }}</strong> 的所有备份文件吗？<br />此操作不可恢复。</p>
      </div>
      <template #footer>
        <div class="del-modal-footer">
          <button class="btn-secondary" @click="showProjectDeleteModal = false">取消</button>
          <button class="btn-danger" @click="confirmDeleteProject">确认删除</button>
        </div>
      </template>
    </NModal>

    <!-- 删除版本确认弹窗 -->
    <NModal v-model:show="showVersionDeleteModal" preset="card" title="删除版本" style="max-width: 420px; border-radius: var(--admin-radius-card);" :mask-closable="false">
      <div class="del-modal-body">
        <div class="del-modal-icon">🗑</div>
        <p class="del-modal-title">确定删除版本 <strong>{{ versionToDelete?.v.versionDir }}</strong> 的所有文件吗？</p>
      </div>
      <template #footer>
        <div class="del-modal-footer">
          <button class="btn-secondary" @click="showVersionDeleteModal = false">取消</button>
          <button class="btn-danger" @click="confirmDeleteVersion">确认删除</button>
        </div>
      </template>
    </NModal>

    <!-- 删除文件确认弹窗 -->
    <NModal v-model:show="showFileDeleteModal" preset="card" title="删除文件" style="max-width: 420px; border-radius: var(--admin-radius-card);" :mask-closable="false">
      <div class="del-modal-body">
        <div class="del-modal-icon">🗑</div>
        <p class="del-modal-title">确定删除文件 <strong>{{ fileToDelete?.f.name }}</strong> 吗？</p>
      </div>
      <template #footer>
        <div class="del-modal-footer">
          <button class="btn-secondary" @click="showFileDeleteModal = false">取消</button>
          <button class="btn-danger" @click="confirmDeleteFile">确认删除</button>
        </div>
      </template>
    </NModal>
  </AdminLayout>
</template>

<style scoped>
.files-scroll {
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-left: 25px;
  margin-right: -3px;
}

/* === 页面头部 === */
.head-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.head-actions button { height: 40px; }

/* === 顶部 3 张统计 === */
.stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.stat-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 22px 24px;
  background: var(--admin-card);
  border: 1px solid var(--admin-border);
  border-radius: var(--admin-radius-card);
  box-shadow: var(--admin-shadow-card);
  transition: transform 0.25s ease, box-shadow 0.25s ease;
  position: relative;
  overflow: hidden;
}
.stat-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--admin-shadow-card-hover);
}
.stat-glow {
  position: absolute;
  top: 0; right: 0;
  width: 120px; height: 120px;
  border-radius: 50%;
  filter: blur(50px);
  opacity: 0.45;
  transform: translate(35%, -35%);
  pointer-events: none;
}
.stat-blue .stat-glow { background: rgba(52, 120, 246, 0.55); }
.stat-purple .stat-glow { background: rgba(140, 108, 255, 0.55); }
.stat-green .stat-glow { background: rgba(60, 179, 113, 0.55); }
.stat-icon {
  width: 52px; height: 52px;
  border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  position: relative; z-index: 1;
}
.stat-blue .stat-icon { background: rgba(52, 120, 246, 0.12); color: #3478F6; }
.stat-purple .stat-icon { background: rgba(140, 108, 255, 0.12); color: #8C6CFF; }
.stat-green .stat-icon { background: rgba(60, 179, 113, 0.14); color: #2A8C56; }
.stat-content { flex: 1; position: relative; z-index: 1; min-width: 0; }
.stat-value {
  font-size: 1.65rem;
  font-weight: 700;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
.stat-blue .stat-value { color: #2563EB; }
.stat-purple .stat-value { color: #6D4FD6; }
.stat-green .stat-value { color: #2A8C56; }
.stat-label {
  font-size: 0.8rem;
  color: var(--text-tertiary);
  margin-top: 4px;
  font-weight: 500;
}

/* === 配置告警 === */
.config-alert {
  border-radius: var(--admin-radius-card) !important;
  border: 1px solid rgba(240, 160, 32, 0.25) !important;
  background: linear-gradient(135deg, rgba(240, 160, 32, 0.08) 0%, rgba(255, 165, 0, 0.04) 100%) !important;
  align-items: flex-start !important;
}
.config-alert :deep(.n-alert__icon) { color: #E07B00; padding-top: 2px; }
.alert-body { display: flex; flex-direction: column; gap: 4px; line-height: 1.55; font-size: 0.88rem; }
:deep(.alert-link) {
  color: var(--color-primary);
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
:deep(.alert-link):hover { color: var(--color-primary-end); }

/* === 数据来源 === */
.source-bar {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  background: var(--color-card-soft);
  border: 1px solid var(--admin-border);
  border-radius: var(--radius-full);
  font-size: 0.8rem;
  color: var(--text-sec);
  align-self: flex-start;
}
.source-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.dot-webdav { background: #3CB371; box-shadow: 0 0 0 3px rgba(60, 179, 113, 0.18); animation: pulse 2s ease-in-out infinite; }
.dot-manifest { background: var(--color-primary); box-shadow: 0 0 0 3px var(--color-primary-soft); }
.source-text strong { color: var(--text-main); font-weight: 600; }

/* === 搜索 === */
.search-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  width: 100%;
}
.search-row :deep(.admin-search-bar) { flex: 1; }
.search-result-count {
  font-size: 0.75rem;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
  background: var(--color-card-soft);
  padding: 3px 10px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}

/* === 项目卡片列表 === */
.project-list { display: flex; flex-direction: column; gap: 14px; }
.proj-card {
  background: var(--admin-card);
  border: 1px solid var(--admin-border);
  border-radius: var(--admin-radius-card);
  box-shadow: var(--admin-shadow-card);
  overflow: hidden;
  transition: box-shadow 0.25s ease, transform 0.25s ease, border-color 0.25s ease;
}
.proj-card:hover { box-shadow: var(--admin-shadow-card-hover); border-color: rgba(79, 140, 255, 0.18); }

.proj-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px;
  cursor: pointer;
  gap: 16px;
  transition: background 0.2s ease;
  user-select: none;
}
.proj-head:hover { background: linear-gradient(90deg, var(--color-primary-soft) 0%, transparent 80%); }
.proj-head:active { background: var(--color-primary-soft); }
.proj-head-left { display: flex; align-items: center; gap: 14px; min-width: 0; flex: 1; }
.proj-icon {
  width: 48px; height: 48px;
  border-radius: 14px;
  background: var(--admin-gradient);
  color: #FFFFFF;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700;
  font-size: 1.2rem;
  flex-shrink: 0;
  box-shadow: 0 6px 18px rgba(79, 140, 255, 0.32);
  letter-spacing: -0.02em;
}
.proj-info { min-width: 0; flex: 1; }
.proj-name-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}
.proj-name {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: -0.005em;
}
.proj-cat-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 9px;
  border-radius: var(--radius-full);
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
}
.proj-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.78rem;
  color: var(--text-tertiary);
  flex-wrap: wrap;
}
.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.meta-item svg { opacity: 0.7; }
.meta-dot { color: var(--border-strong); font-weight: 700; }

.proj-head-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.caret {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px; height: 28px;
  border-radius: 8px;
  color: var(--text-tertiary);
  background: var(--color-card-soft);
  transition: all 0.2s ease;
}
.caret.open { transform: rotate(90deg); background: var(--color-primary-soft); color: var(--color-primary); }

/* === 版本卡 === */
.version-list {
  border-top: 1px solid var(--admin-border);
  background: linear-gradient(180deg, var(--color-card-soft) 0%, rgba(248, 250, 252, 0.5) 100%);
  padding: 16px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 12px;
  animation: riseFade 0.3s ease;
}
.version-card {
  background: var(--admin-card);
  border: 1px solid var(--admin-border);
  border-radius: 18px;
  padding: 14px 16px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}
.version-card:hover {
  border-color: rgba(79, 140, 255, 0.25);
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.05);
  transform: translateY(-1px);
}
.version-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px dashed var(--admin-border);
}
.version-info { display: flex; align-items: center; gap: 10px; min-width: 0; }
.version-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 12px;
  border-radius: var(--radius-full);
  background: var(--admin-gradient);
  color: #FFFFFF;
  font-size: 0.8rem;
  font-weight: 600;
  font-family: var(--font-mono);
  flex-shrink: 0;
  box-shadow: 0 3px 10px rgba(79, 140, 255, 0.25);
}
.version-meta {
  font-size: 0.78rem;
  color: var(--text-tertiary);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.file-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.file-item {
  display: flex;
  align-items: center;
  gap: 4px;
  border-radius: 10px;
  transition: background 0.15s;
  position: relative;
}
.file-item:hover { background: var(--color-card-soft); }
.file-link {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  text-decoration: none;
  color: var(--text-main);
  padding: 7px 8px;
  border-radius: 10px;
  transition: all 0.15s;
}
.file-link:hover { color: var(--color-primary); }
.file-link:hover .file-download { opacity: 1; transform: translateX(0); }
.file-link:hover .file-name { color: var(--color-primary); }

.file-icon {
  width: 28px; height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.65rem;
  font-weight: 700;
  font-family: var(--font-mono);
  letter-spacing: -0.02em;
  flex-shrink: 0;
}
.file-name {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 0.82rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.15s;
}
.file-size {
  color: var(--text-tertiary);
  font-size: 0.74rem;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
  background: var(--color-card-soft);
  padding: 2px 8px;
  border-radius: var(--radius-full);
}
.file-download {
  color: var(--color-primary);
  opacity: 0;
  transform: translateX(-4px);
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

/* === 危险按钮 === */
.btn-text-danger {
  color: var(--text-tertiary);
  text-decoration: none;
  font-size: 0.78rem;
  font-weight: 500;
  background: none;
  border: none;
  cursor: pointer;
  padding: 5px 10px;
  border-radius: 8px;
  transition: background 0.15s, color 0.15s;
  white-space: nowrap;
}
.btn-text-danger:hover:not(:disabled) {
  color: #E55353;
  background: rgba(229, 83, 83, 0.1);
}
.btn-text-danger:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-danger-soft {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 12px;
  border-radius: 10px;
  background: rgba(229, 83, 83, 0.08);
  color: #E55353;
  border: 1px solid rgba(229, 83, 83, 0.18);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s;
}
.btn-danger-soft:hover:not(:disabled) {
  background: rgba(229, 83, 83, 0.16);
  border-color: rgba(229, 83, 83, 0.32);
  transform: scale(1.03);
}
.btn-danger-soft:disabled { opacity: 0.4; cursor: not-allowed; }

.file-del { padding: 5px 8px; font-size: 0.74rem; }

/* === 加载/空状态 === */
.loading-state, .empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-tertiary);
  font-size: 0.95rem;
  background: var(--admin-card);
  border: 1px dashed var(--admin-border);
  border-radius: var(--admin-radius-card);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid var(--color-primary-soft);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 8px;
}
@keyframes spin { to { transform: rotate(360deg); } }
.spinning { animation: spin 1s linear infinite; transform-origin: center; }

.empty-illust {
  color: var(--color-primary);
  opacity: 0.7;
  margin-bottom: 4px;
}
.empty-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-main);
  margin: 0;
}
.empty-desc {
  font-size: 0.85rem;
  color: var(--text-tertiary);
  margin: 0 0 12px;
  max-width: 420px;
  line-height: 1.5;
}
.empty-state .btn-secondary, .empty-state .btn-primary { height: 38px; padding: 0 18px; font-size: 0.88rem; }

/* === 删除确认弹窗 === */
.del-modal-body { text-align: center; padding: 8px 0; }
.del-modal-icon { font-size: 2.8rem; margin-bottom: 8px; }
.del-modal-title { font-size: 1.05rem; color: var(--text-main); margin: 0; line-height: 1.5; }
.del-modal-title strong { color: #E55353; }
.del-modal-footer { display: flex; justify-content: center; gap: 12px; }

@media (max-width: 768px) {
  .stats-row { grid-template-columns: 1fr; }
  .head-actions { width: 100%; }
  .head-actions button { flex: 1; }
  .proj-head { flex-direction: column; align-items: flex-start; gap: 12px; padding: 16px 18px; }
  .proj-head-right { width: 100%; justify-content: space-between; }
  .version-list { grid-template-columns: 1fr; padding: 12px; }
  .version-head { flex-direction: column; align-items: flex-start; }
  .file-link { padding: 8px 6px; }
  .file-download { display: none; }
}
</style>
