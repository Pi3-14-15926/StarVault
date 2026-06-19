<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useMessage, NUpload, NProgress, NAlert, NDrawer, NDrawerContent, NTag } from 'naive-ui'
import type { UploadFileInfo } from 'naive-ui'
import { useProjectStore } from '../../store/project'
import { useCategoryStore } from '../../store/category'
import { useSettingStore } from '../../store/settings'
import { syncAllGitHub, getSoftwareVersions } from '../../utils/api'
import { triggerSyncBackup, getRepoInfo } from '../../utils/githubRepo'
import { commitAllData } from '../../utils/githubRepo'
import { listIcons } from '../../utils/iconsApi'
import { DEFAULT_SETTINGS } from '../../defaults'
import { getToken } from '../../utils/auth'
import * as api from '../../utils/api'
import type { AppData, Download, EnrichError } from '../../types'
import AdminLayout from '../../components/admin/AdminLayout.vue'

const message = useMessage()
const projects = useProjectStore()
const categories = useCategoryStore()
const settingStore = useSettingStore()

const scheduleNote = computed(() => {
  const sc = settingStore.settings.schedule
  if (!sc) return '定时任务未配置'
  const sync = sc.syncEnabled ? `同步 ${sc.syncIntervalHours}h` : '同步已禁用'
  const backup = sc.backupEnabled ? `备份 ${sc.backupIntervalHours}h` : '备份已禁用'
  return `${sync}  ${backup}`
})

const syncing = ref(false)
const syncResult = ref('')
const syncErrors = ref<Array<{ name: string; repo: string; status?: number; message: string }>>([])
const showSyncErrorsDrawer = ref(false)
const LAST_SYNC_KEY = 'dashboard_lastSyncTime'
const lastSyncTime = ref<Date | null>(loadLastSyncTime())
function loadLastSyncTime(): Date | null {
  try {
    const v = localStorage.getItem(LAST_SYNC_KEY)
    if (!v) return null
    const d = new Date(v)
    return isNaN(d.getTime()) ? null : d
  } catch { return null }
}
function saveLastSyncTime(d: Date) {
  try { localStorage.setItem(LAST_SYNC_KEY, d.toISOString()) } catch {}
}
const backingUp = ref(false)

const githubCount = computed(() => projects.software.filter((p) => p.sourceType === 'github').length)
const customCount = computed(() => projects.software.filter((p) => p.sourceType === 'custom').length)
const totalVersions = computed(() =>
  projects.software.reduce((sum, p) => sum + getSoftwareVersions(p.id).length, 0),
)
const iconCount = ref(0)

async function loadIconCount() {
  try {
    const r = await listIcons()
    if (!r.error) iconCount.value = r.items.length
  } catch {}
}

async function doSync() {
  syncing.value = true
  syncResult.value = ''
  syncErrors.value = []
  try {
    const results = await syncAllGitHub()
    const ok = results.filter((r) => r.success).length
    const failed = results.filter((r) => !r.success)
    syncErrors.value = failed.map((r) => ({
      name: r.projectName || r.projectId,
      repo: r.repo || '',
      status: r.status,
      message: r.error || '未知错误',
    }))
    syncResult.value = `同步完成：${ok}/${results.length} 个项目成功`
    lastSyncTime.value = new Date()
    saveLastSyncTime(lastSyncTime.value)
    if (failed.length === 0) {
      message.success(syncResult.value)
    } else {
      message.warning(syncResult.value + `，${failed.length} 个失败`)
    }
    projects.refresh()
  } catch (e: any) {
    syncResult.value = `同步失败：${e.message}`
    message.error(syncResult.value)
  }
  syncing.value = false
}

async function doSyncBackup() {
  backingUp.value = true
  try {
    await triggerSyncBackup()
    message.success('已触发同步 + WebDAV 备份工作流')
  } catch (e: any) {
    message.error('触发失败：' + e.message)
  }
  backingUp.value = false
}

const refreshing = ref(false)
const refreshResult = ref('')
const LAST_REFRESH_KEY = 'dashboard_lastRefreshTime'
const lastRefreshTime = ref<Date | null>(loadLastRefreshTime())
function loadLastRefreshTime(): Date | null {
  try {
    const v = localStorage.getItem(LAST_REFRESH_KEY)
    if (!v) return null
    const d = new Date(v)
    return isNaN(d.getTime()) ? null : d
  } catch { return null }
}
function saveLastRefreshTime(d: Date) {
  try { localStorage.setItem(LAST_REFRESH_KEY, d.toISOString()) } catch {}
}
const refreshProgress = ref(0)
const refreshErrors = ref<EnrichError[]>([])
const showErrorsDrawer = ref(false)

async function doRefreshDownloads() {
  refreshing.value = true
  refreshResult.value = ''
  refreshProgress.value = 0
  refreshErrors.value = []
  try {
    const token = getToken() || undefined
    const allDownloads: Download[] = []
    for (const sw of projects.software) {
      for (const v of api.getSoftwareVersions(sw.id)) {
        allDownloads.push(...api.getVersionDownloads(v.id))
      }
    }
    if (allDownloads.length === 0) {
      refreshResult.value = '没有可刷新的下载项'
      message.warning(refreshResult.value)
      refreshing.value = false
      return
    }
    let lastRateLimited = 0
    const counts = await api.enrichDownloadCounts(allDownloads, token, (p) => {
      refreshProgress.value = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0
      lastRateLimited = p.rateLimited
      refreshErrors.value = p.errors
      const rt = p.retried > 0 ? ` · 重试 ${p.retried}` : ''
      const rl = p.rateLimited > 0 ? ` · 限速 ${p.rateLimited}` : ''
      const er = p.errored > 0 ? ` · 失败 ${p.errored}` : ''
      const tag = p.status === 'retry' ? ' · 限速等待重试中...' : ''
      refreshResult.value = `拉取中 ${p.done}/${p.total}（${refreshProgress.value}%）${rt}${rl}${er}${tag}`
    })
    const updated = api.batchUpdateDownloadCounts(counts)
    const skipped = allDownloads.length - updated
    const limitNote = lastRateLimited > 0
      ? `（${lastRateLimited} 个仓库命中 GitHub API 限速，建议稍后重试或检查 Token 有效性）`
      : (skipped > 0 ? '（部分 URL 解析失败或仓库不可访问）' : '')
    refreshResult.value = `已更新 ${updated} 个文件，跳过 ${skipped} 个${limitNote}`
    lastRefreshTime.value = new Date()
    saveLastRefreshTime(lastRefreshTime.value)
    message.success(refreshResult.value)
    projects.refresh()
  } catch (e: any) {
    refreshResult.value = `刷新失败：${e.message}`
    message.error(refreshResult.value)
  }
  refreshing.value = false
}

const stats = computed(() => [
  {
    label: '项目总数',
    value: projects.software.length,
    desc: `GitHub ${githubCount.value} · 自定义 ${customCount.value}`,
    color: 'purple',
    icon: '🔗',
  },
  { label: '页面总数', value: categories.categories.length, desc: '所有页面累计', color: 'green', icon: '📂' },
  { label: '版本总数', value: totalVersions.value, desc: '所有项目累计', color: 'pink', icon: '🚀' },
  { label: '图标总数', value: iconCount.value, desc: '所有图标累计', color: 'blue', icon: '🖼️' },
])

/* ============== 导入导出 ============== */
const exporting = ref(false)
const importing = ref(false)
const importProgress = ref(0)
const baking = ref(false)
const publishing = ref(false)
const commitUrl = ref('')
const currentRepo = ref('')

// ===== GitHub 上传设置 =====
const uploadSettings = ref({
  syncEnabled: settingStore.settings.schedule?.syncEnabled ?? false,
  syncIntervalHours: settingStore.settings.schedule?.syncIntervalHours ?? 6,
  backupEnabled: settingStore.settings.schedule?.backupEnabled ?? false,
  backupIntervalHours: settingStore.settings.schedule?.backupIntervalHours ?? 24,
  uploadTimeout: settingStore.settings.uploadTimeout ?? 600,
  maxFileSizeMB: settingStore.settings.maxFileSizeMB ?? 500,
})
const uploadSettingsSaving = ref(false)

onMounted(() => {
  const r = getRepoInfo()
  currentRepo.value = `${r.owner}/${r.repo}`
  loadIconCount()
})

function exportData() {
  exporting.value = true
  try {
    const json = api.exportAppData()
    const data = JSON.parse(json)
    const wrapper = {
      exportTime: new Date().toISOString(),
      version: '1.0.0',
      ...data,
    }
    const blob = new Blob([JSON.stringify(wrapper, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `softwarehub-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    message.success('导出成功')
  } catch (e: any) {
    message.error('导出失败: ' + e.message)
  } finally {
    exporting.value = false
  }
}

function importFromJSON({ file }: { file: UploadFileInfo }) {
  if (importing.value || !file.file) return
  importing.value = true
  importProgress.value = 0
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const text = e.target?.result as string
      const data = JSON.parse(text)
      let appData: AppData
      if (data.software && data.versions && data.downloads) {
        appData = data as AppData
      } else if (data.projects && data.categories && data.settings) {
        appData = {
          index: [],
          software: {},
          versions: {},
          downloads: {},
          categories: data.categories,
          settings: data.settings,
          iconAssets: data.iconAssets || [],
          backupManifest: data.backupManifest || { entries: [], updatedAt: new Date().toISOString() },
        }
        for (const p of data.projects) {
          const slug = p.categorySlug || p.categoryId
          if (!appData.software[slug]) appData.software[slug] = []
          const sw = {
            id: p.id, slug: p.slug, sourceType: p.sourceType, name: p.name,
            description: p.description, logo: p.logo, categorySlug: slug,
            featured: p.featured, githubRepo: p.githubRepo, githubUrl: p.githubUrl,
            website: p.website, stars: p.stars, forks: p.forks,
            latestVersionId: p.latestVersionId,
            latestUpdateTime: p.latestUpdateTime,
          }
          appData.software[slug].push(sw)
          appData.index.push({
            id: sw.id, name: sw.name, slug: sw.slug, categorySlug: sw.categorySlug,
            description: sw.description, logo: sw.logo, featured: sw.featured,
            latestVersionId: sw.latestVersionId, latestUpdateTime: sw.latestUpdateTime,
            githubRepo: sw.githubRepo, githubUrl: sw.githubUrl, website: sw.website,
            stars: sw.stars, forks: sw.forks,
          })
          if (p.versions) {
            if (!appData.versions[slug]) appData.versions[slug] = []
            for (const v of p.versions) {
              const newV = {
                id: v.id, projectId: p.id, version: v.version, publishedAt: v.publishedAt,
                changelog: v.changelog, downloadIds: [] as string[],
              }
              appData.versions[slug].push(newV)
              if (v.downloads) {
                if (!appData.downloads[slug]) appData.downloads[slug] = []
                for (const dl of v.downloads) {
                  const newDl = {
                    id: dl.id || `dl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    versionId: v.id, platform: dl.platform, filename: dl.filename,
                    size: dl.size, url: dl.url,
                    downloadCount: dl.downloadCount,
                    downloadCountSyncedAt: dl.downloadCountSyncedAt,
                  }
                  appData.downloads[slug].push(newDl)
                  newV.downloadIds.push(newDl.id)
                }
              }
            }
          }
        }
      } else {
        message.error('无效的备份文件：缺少必需字段')
        importing.value = false
        return
      }
      importProgress.value = 50
      api.saveAppData(appData)
      importProgress.value = 100
      const swCount = Object.values(appData.software).reduce((s, arr) => s + arr.length, 0)
      const verCount = Object.values(appData.versions).reduce((s, arr) => s + arr.length, 0)
      const dlCount = Object.values(appData.downloads).reduce((s, arr) => s + arr.length, 0)
      message.success(
        `导入成功！${swCount} 个项目、${verCount} 个版本、${dlCount} 个下载、${appData.categories.length} 个分类`,
      )
    } catch (e: any) {
      message.error('导入失败: ' + e.message)
    } finally {
      importing.value = false
    }
  }
  reader.onerror = () => { message.error('文件读取失败'); importing.value = false }
  reader.readAsText(file.file as Blob)
}

async function bakeDefaults() {
  baking.value = true
  try {
    const settings = api.getSettings()
    const res = await fetch('/__bake-defaults', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: '未知错误' }))
      throw new Error(err.error || `HTTP ${res.status}`)
    }
    message.success('默认配置已写入 src/defaults.ts')
  } catch (e: any) {
    message.error('写入失败: ' + e.message)
  } finally {
    baking.value = false
  }
}

function resetDefaults() {
  api.saveSettings({ ...DEFAULT_SETTINGS })
  message.success('设置已恢复为默认值')
}

async function publishToRepo() {
  publishing.value = true
  commitUrl.value = ''
  try {
    const result = await commitAllData()
    commitUrl.value = `https://github.com/${result.repo}/commits/main`
    message.success(`已提交 ${result.files} 个文件到 ${result.repo}，等待构建部署...`)
  } catch (e: any) {
    message.error('发布失败: ' + e.message)
  } finally { publishing.value = false }
}

onMounted(() => {
  projects.refresh()
  categories.refresh()
})

function fmtDateTime(d: Date | null): string {
  if (!d) return '—'
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function saveUploadSettings() {
  uploadSettingsSaving.value = true
  try {
    const s = settingStore.settings
    s.schedule = {
      syncEnabled: uploadSettings.value.syncEnabled,
      syncIntervalHours: uploadSettings.value.syncIntervalHours,
      backupEnabled: uploadSettings.value.backupEnabled,
      backupIntervalHours: uploadSettings.value.backupIntervalHours,
    }
    s.uploadTimeout = uploadSettings.value.uploadTimeout
    s.maxFileSizeMB = uploadSettings.value.maxFileSizeMB
    settingStore.save(s)
    message.success('上传设置已保存')
  } catch (e: any) {
    message.error('保存失败: ' + e.message)
  }
  uploadSettingsSaving.value = false
}
</script>

<template>
  <AdminLayout>
    <div class="dash-scroll">
      <div class="page-head">
        <div>
          <h2 class="page-title"><span class="page-title-emoji">📊</span>统计概览</h2>
          <p class="page-desc">Software Hub 管理后台概览</p>
        </div>
      </div>

      <div class="stats-grid">
        <div
          v-for="s in stats"
          :key="s.label"
          :class="['stat-card', `stat-${s.color}`]"
        >
          <div class="stat-icon">{{ s.icon }}</div>
          <div class="stat-content">
            <div class="stat-value">{{ s.value }}</div>
            <div class="stat-title">{{ s.label }}</div>
            <div class="stat-desc">{{ s.desc }}</div>
          </div>
        </div>
      </div>

      <div class="action-grid">
        <div class="action-card">
          <div class="action-icon">🔄</div>
          <div class="action-content">
            <h3 class="action-title">GitHub 同步</h3>
            <p class="action-desc">在 GitHub 服务器上自动拉取 Release 信息</p>
            <div class="action-buttons">
              <button class="btn-primary" :disabled="syncing" @click="doSync">
                {{ syncing ? '同步中...' : '同步Release' }}
              </button>
            </div>
            <div v-if="syncResult" class="action-result">
              <span>{{ syncResult }}</span>
            </div>
            <button
              v-if="syncErrors.length > 0"
              class="view-errors-btn"
              @click="showSyncErrorsDrawer = true"
            >
              ⚠️ 查看 {{ syncErrors.length }} 个失败详情 →
            </button>
            <div class="sync-time">
              <span class="green-pill">
                <span class="pill-label">上次同步时间</span>
                <span class="pill-value"> {{ fmtDateTime(lastSyncTime) }}</span>
              </span>
            </div>
          </div>
        </div>

        <div class="action-card">
          <div class="action-icon">☁️</div>
          <div class="action-content">
            <h3 class="action-title">GitHub 同步并备份</h3>
            <p class="action-desc">同步 Release 同时执行 WebDAV 云盘备份</p>
            <div class="action-buttons">
              <button class="btn-primary" :disabled="backingUp" @click="doSyncBackup">
                {{ backingUp ? '触发中...' : '同步并备份' }}
              </button>
            </div>
            <div class="sync-time">
              <span class="green-pill">
                <span class="pill-label">设定同步时刻</span>
                <span class="pill-value"> {{ scheduleNote }}</span>
              </span>
            </div>
          </div>
        </div>

        <div class="action-card">
          <div class="action-icon">📊</div>
          <div class="action-content">
            <h3 class="action-title">刷新下载量</h3>
            <p class="action-desc">批量拉取所有 GitHub 资产的真实下载量</p>
            <div class="action-buttons">
              <button class="btn-primary" :disabled="refreshing" @click="doRefreshDownloads">
                {{ refreshing ? '刷新中...' : '刷新下载量' }}
              </button>
            </div>
            <NProgress
              v-if="refreshing && refreshProgress > 0"
              type="line"
              :percentage="refreshProgress"
              :height="6"
              :border-radius="999"
              class="import-progress"
            />
            <div v-if="refreshResult" class="action-result">
              <span>{{ refreshResult }}</span>
            </div>
            <button
              v-if="refreshErrors.length > 0"
              class="view-errors-btn"
              @click="showErrorsDrawer = true"
            >
              ⚠️ 查看 {{ refreshErrors.length }} 个失败详情 →
            </button>
            <div class="sync-time">
              <span class="green-pill">
                <span class="pill-label">上次刷新时间</span>
                <span class="pill-value"> {{ fmtDateTime(lastRefreshTime) }}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- GitHub 上传设置 -->
      <section class="settings-card upload-settings-card">
        <header class="card-head">
          <div class="card-icon upload">
            <span class="icon-ring"></span>
            ⚙️
          </div>
          <div>
            <h3 class="card-title">GitHub 上传设置</h3>
            <p class="card-desc">配置定时同步备份策略、上传超时和文件大小限制</p>
          </div>
        </header>

        <div class="upload-grid">
          <!-- 定时同步 -->
          <div class="upload-group">
            <div class="group-header">
              <div class="group-icon">🕐</div>
              <span class="group-title">定时同步</span>
            </div>
            <div class="setting-row">
              <label class="setting-label">启用同步</label>
              <div class="toggle-wrap">
                <input id="sync-toggle" v-model="uploadSettings.syncEnabled" type="checkbox" class="toggle-input" />
                <label for="sync-toggle" class="toggle-slider"></label>
              </div>
            </div>
            <div class="setting-row" :class="{ disabled: !uploadSettings.syncEnabled }">
              <label class="setting-label">同步间隔</label>
              <div class="input-group">
                <input
                  v-model.number="uploadSettings.syncIntervalHours"
                  type="number"
                  min="1"
                  max="72"
                  class="setting-input"
                  :disabled="!uploadSettings.syncEnabled"
                />
                <span class="input-suffix">小时</span>
              </div>
            </div>
          </div>

          <!-- 定时备份 -->
          <div class="upload-group">
            <div class="group-header">
              <div class="group-icon">☁️</div>
              <span class="group-title">定时备份</span>
            </div>
            <div class="setting-row">
              <label class="setting-label">启用备份</label>
              <div class="toggle-wrap">
                <input id="backup-toggle" v-model="uploadSettings.backupEnabled" type="checkbox" class="toggle-input" />
                <label for="backup-toggle" class="toggle-slider"></label>
              </div>
            </div>
            <div class="setting-row" :class="{ disabled: !uploadSettings.backupEnabled }">
              <label class="setting-label">备份间隔</label>
              <div class="input-group">
                <input
                  v-model.number="uploadSettings.backupIntervalHours"
                  type="number"
                  min="1"
                  max="168"
                  class="setting-input"
                  :disabled="!uploadSettings.backupEnabled"
                />
                <span class="input-suffix">小时</span>
              </div>
            </div>
          </div>

          <!-- 上传超时 -->
          <div class="upload-group">
            <div class="group-header">
              <div class="group-icon timeout">⏱️</div>
              <span class="group-title">文件超时</span>
            </div>
            <div class="setting-row">
              <label class="setting-label">超时时间</label>
              <div class="input-group">
                <input
                  v-model.number="uploadSettings.uploadTimeout"
                  type="number"
                  min="60"
                  max="3600"
                  class="setting-input"
                />
                <span class="input-suffix">秒</span>
              </div>
            </div>
            <p class="setting-hint">超时后自动跳过当前文件，开始处理下一个</p>
          </div>

          <!-- 文件大小限制 -->
          <div class="upload-group">
            <div class="group-header">
              <div class="group-icon size">📦</div>
              <span class="group-title">文件大小限制</span>
            </div>
            <div class="setting-row">
              <label class="setting-label">最大文件</label>
              <div class="input-group">
                <input
                  v-model.number="uploadSettings.maxFileSizeMB"
                  type="number"
                  min="10"
                  max="10240"
                  class="setting-input"
                />
                <span class="input-suffix">MB</span>
              </div>
            </div>
            <p class="setting-hint">超过此大小的文件自动跳过，不上传到云盘</p>
          </div>
        </div>

        <div class="upload-actions">
          <button class="btn-primary" :disabled="uploadSettingsSaving" @click="saveUploadSettings">
            {{ uploadSettingsSaving ? '保存中...' : '保存设置' }}
          </button>
        </div>
      </section>

      <!-- 导入导出 -->
      <section class="settings-card">
        <header class="card-head">
          <div class="card-icon io">📋</div>
          <div>
            <h3 class="card-title">导入导出</h3>
            <p class="card-desc">数据备份、迁移、发布到 GitHub 仓库</p>
          </div>
        </header>

        <div class="io-grid">
          <div class="io-card">
            <div class="io-mini-icon">📤</div>
            <div class="io-content">
              <h4 class="io-title">导出数据</h4>
              <p class="io-desc">将项目、分类、设置打包为 JSON 文件下载到本地</p>
              <button class="btn-primary" :disabled="exporting" @click="exportData">
                {{ exporting ? '导出中...' : '导出数据' }}
              </button>
            </div>
          </div>

          <div class="io-card">
            <div class="io-mini-icon">📥</div>
            <div class="io-content">
              <h4 class="io-title">导入数据</h4>
              <p class="io-desc">从备份 JSON 文件恢复所有数据到 localStorage</p>
              <NUpload accept=".json" :max="1" :show-file-list="false" :disabled="importing" @change="importFromJSON">
                <button class="btn-primary" :disabled="importing">
                  {{ importing ? '导入中...' : '导入数据' }}
                </button>
              </NUpload>
              <NProgress v-if="importing" type="line" :percentage="importProgress" :height="6" :border-radius="999" class="import-progress" />
            </div>
          </div>

          <div class="io-card">
            <div class="io-mini-icon">🔧</div>
            <div class="io-content">
              <h4 class="io-title">写入默认</h4>
              <p class="io-desc">将当前设置烘焙到 src/defaults.ts，构建后所有设备样式一致</p>
              <div class="action-row">
                <button class="btn-primary" :disabled="baking" @click="bakeDefaults">
                  {{ baking ? '写入中...' : '写入设置' }}
                </button>
                <button class="btn-ghost" @click="resetDefaults">恢复默认</button>
              </div>
            </div>
          </div>

          <div class="io-card">
            <div class="io-mini-icon">🚀</div>
            <div class="io-content">
              <h4 class="io-title">发布到 GitHub</h4>
              <p class="io-desc">将 localStorage 中的所有数据提交到仓库，触发 GitHub Pages 重新构建</p>
              <div class="io-meta">
                <span class="green-pill">
                  <span class="pill-label">当前目标</span>
                  <span class="pill-value"> {{ currentRepo || '未配置' }}</span>
                </span>
              </div>
              <div class="action-row">
                <button class="btn-primary" :disabled="publishing" @click="publishToRepo">
                  {{ publishing ? '提交中...' : '立即发布' }}
                </button>
                <a v-if="commitUrl" :href="commitUrl" target="_blank" rel="noopener" class="commit-link">
                  查看提交记录 →
                </a>
              </div>
            </div>
          </div>
        </div>
    </section>
    </div>

    <NModal v-model:show="showErrorsDrawer" preset="card" title="刷新失败详情" style="max-width: 560px; border-radius: var(--radius-lg);" :mask-closable="true">
      <div class="errors-modal-body">
        <p class="errors-hint">
          以下 {{ refreshErrors.length }} 个 release 调用 GitHub API 失败。常见原因：仓库私有、release 被删除、tag 不存在。点击链接可手动打开查看。
        </p>
        <div class="error-list">
          <div v-for="(e, i) in refreshErrors" :key="i" class="error-item">
            <div class="error-head">
              <NTag :type="e.status === 404 ? 'warning' : (e.status === 403 || e.status === 429 ? 'error' : 'default')" size="small">
                {{ e.status ? `HTTP ${e.status}` : '网络/超时' }}
              </NTag>
              <a :href="e.url" target="_blank" rel="noopener" class="error-link">{{ e.group }}</a>
            </div>
            <div class="error-msg">{{ e.message }}</div>
          </div>
        </div>
      </div>
      <template #footer>
        <div class="modal-actions">
          <button class="btn-secondary" @click="showErrorsDrawer = false">关闭</button>
        </div>
      </template>
    </NModal>

    <NModal v-model:show="showSyncErrorsDrawer" preset="card" title="同步失败详情" style="max-width: 560px; border-radius: var(--radius-lg);" :mask-closable="true">
      <div class="errors-modal-body">
        <p class="errors-hint">
          以下 {{ syncErrors.length }} 个项目同步失败。常见原因：仓库不存在、仓库为私有、Token 无效、API 限速。
        </p>
        <div class="error-list">
          <div v-for="(e, i) in syncErrors" :key="i" class="error-item">
            <div class="error-head">
              <NTag :type="e.status === 404 ? 'warning' : (e.status === 403 || e.status === 429 ? 'error' : 'default')" size="small">
                {{ e.status ? `HTTP ${e.status}` : '网络/超时' }}
              </NTag>
              <a v-if="e.repo" :href="`https://github.com/${e.repo}`" target="_blank" rel="noopener" class="error-link">{{ e.name }}</a>
              <span v-else class="error-link">{{ e.name }}</span>
            </div>
            <div class="error-msg">{{ e.message }}</div>
          </div>
        </div>
      </div>
      <template #footer>
        <div class="modal-actions">
          <button class="btn-secondary" @click="showSyncErrorsDrawer = false">关闭</button>
        </div>
      </template>
    </NModal>
  </AdminLayout>
</template>

<style scoped>
.dash-scroll {
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-left: 25px;
  margin-right: -3px;
}
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
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
.stat-card::before {
  content: '';
  position: absolute;
  top: 0; right: 0;
  width: 110px; height: 110px;
  border-radius: 50%;
  filter: blur(45px);
  opacity: 0.4;
  transform: translate(30%, -30%);
}
.stat-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--admin-shadow-card-hover);
}
.stat-blue::before   { background: rgba(52, 120, 246, 0.4); }
.stat-purple::before { background: rgba(140, 108, 255, 0.4); }
.stat-green::before  { background: rgba(60, 179, 113, 0.4); }
.stat-orange::before { background: rgba(240, 160, 32, 0.4); }
.stat-pink::before   { background: rgba(255, 107, 107, 0.4); }
.stat-cyan::before   { background: rgba(79, 193, 255, 0.4); }

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: var(--color-card-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  flex-shrink: 0;
  position: relative;
  z-index: 1;
}
.stat-content { flex: 1; min-width: 0; position: relative; z-index: 1; }
.stat-value {
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--text-main);
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}
.stat-title {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text-main);
  margin-top: 2px;
}
.stat-desc {
  font-size: 0.74rem;
  color: var(--text-tertiary);
  margin-top: 1px;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 16px;
}
.action-card {
  display: flex;
  gap: 16px;
  padding: 22px 24px;
  background: var(--admin-card);
  border: 1px solid var(--admin-border);
  border-radius: var(--admin-radius-card);
  box-shadow: var(--admin-shadow-card);
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}
.action-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--admin-shadow-card-hover);
}
.action-icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: var(--admin-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  flex-shrink: 0;
  color: #FFFFFF;
  box-shadow: 0 6px 20px rgba(79, 140, 255, 0.28);
}
.action-content { flex: 1; min-width: 0; }
.action-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0 0 4px;
}
.action-desc {
  font-size: 0.88rem;
  color: var(--text-sec);
  margin: 0 0 14px;
  line-height: 1.5;
}
.action-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.action-result {
  margin-top: 10px;
  font-size: 0.85rem;
  color: var(--color-success);
  font-weight: 500;
}
.sync-time {
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.sync-time .meta-label {
  font-size: 0.72rem;
  color: var(--text-tertiary);
}
.green-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-mono);
  background: rgba(60, 179, 113, 0.12);
  padding: 2px 10px;
  border-radius: var(--radius-full);
  font-size: 0.72rem;
  font-weight: 600;
  border: 1px solid rgba(60, 179, 113, 0.25);
}
.green-pill .pill-label { color: #3478F6; }
.green-pill .pill-value { color: #2D8F5A; }

/* === 导入导出卡片 === */
.settings-card {
  background: var(--admin-card);
  border: 1px solid var(--admin-border);
  border-radius: var(--admin-radius-card);
  box-shadow: var(--admin-shadow-card);
  padding: 24px;
  transition: box-shadow 0.25s ease, transform 0.25s ease;
}
.upload-settings-card {
  border: 1px solid rgba(79, 140, 255, 0.18);
  background: linear-gradient(135deg, rgba(79, 140, 255, 0.03) 0%, rgba(140, 108, 255, 0.03) 100%);
}
.upload-settings-card:hover {
  box-shadow: 0 8px 30px rgba(79, 140, 255, 0.1);
}
.card-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--admin-border);
}
.card-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.3rem;
  flex-shrink: 0;
  background: rgba(52, 120, 246, 0.12);
}
.card-icon.io { background: rgba(140, 108, 255, 0.12); }
.card-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0 0 2px;
}
.card-desc {
  font-size: 0.82rem;
  color: var(--text-tertiary);
  margin: 0;
}

.io-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.io-card {
  display: flex;
  gap: 14px;
  padding: 18px 20px;
  background: var(--color-card-soft);
  border: 1px solid var(--admin-border);
  border-radius: 18px;
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}
.io-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.05);
}
.io-mini-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--admin-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  flex-shrink: 0;
  color: #FFFFFF;
  box-shadow: 0 4px 14px rgba(79, 140, 255, 0.24);
}
.io-content { flex: 1; min-width: 0; }
.io-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0 0 4px;
}
.io-desc {
  font-size: 0.82rem;
  color: var(--text-sec);
  margin: 0 0 12px;
  line-height: 1.5;
}
.action-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.commit-link {
  font-size: 0.85rem;
  color: var(--color-primary);
  text-decoration: none;
  font-weight: 500;
  transition: color 0.18s ease;
}
.commit-link:hover { text-decoration: underline; }
.import-progress { margin-top: 10px; }

.io-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin: 0 0 10px;
}
.io-meta .meta-label {
  font-size: 0.72rem;
  color: var(--text-tertiary);
}
.io-meta code {
  font-family: var(--font-mono);
  background: rgba(60, 179, 113, 0.12);
  color: #2D8F5A;
  padding: 2px 10px;
  border-radius: var(--radius-full);
  font-size: 0.72rem;
  font-weight: 600;
  border: 1px solid rgba(60, 179, 113, 0.25);
  letter-spacing: 0.2px;
}
.btn-sm { padding: 6px 12px !important; font-size: 0.82rem !important; }

.info-alert {
  background: rgba(79, 140, 255, 0.06) !important;
  border: 1px solid rgba(79, 140, 255, 0.18) !important;
  border-radius: var(--radius-lg);
  margin-top: 16px;
}
.info-alert code {
  font-size: 0.8rem;
  background: var(--admin-card);
  padding: 1px 6px;
  border-radius: 4px;
  font-family: var(--font-mono);
  color: var(--color-primary);
}

.action-result-link {
  margin-left: 10px;
  color: var(--color-primary);
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.action-result-link:hover { opacity: 0.8; }

.view-errors-btn {
  display: inline-block;
  margin-top: 6px;
  padding: 3px 10px;
  background: rgba(255, 193, 7, 0.15);
  color: #C28A1A;
  border: 1px solid rgba(255, 193, 7, 0.45);
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.18s, transform 0.18s;
}
.view-errors-btn:hover {
  background: rgba(255, 193, 7, 0.25);
  transform: translateY(-1px);
}

.errors-modal-body {
  max-height: 60vh;
  overflow-y: auto;
  padding: 4px 2px;
}
.errors-hint {
  font-size: 0.86rem;
  color: var(--text-sec);
  line-height: 1.6;
  margin: 0 0 16px;
  padding: 10px 14px;
  background: rgba(255, 193, 7, 0.08);
  border-left: 3px solid #C28A1A;
  border-radius: 6px;
}
.error-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.error-item {
  background: var(--color-card-soft);
  border: 1px solid var(--admin-border);
  border-radius: 12px;
  padding: 12px 14px;
  transition: border-color 0.18s, box-shadow 0.18s;
}
.error-item:hover {
  border-color: rgba(52, 120, 246, 0.3);
  box-shadow: 0 2px 8px rgba(52, 120, 246, 0.08);
}
.error-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}
.error-link {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--color-primary);
  text-decoration: none;
  word-break: break-all;
  font-weight: 500;
}
.error-link:hover { text-decoration: underline; }
.error-msg {
  font-size: 0.78rem;
  color: var(--text-tertiary);
  margin-top: 4px;
  font-family: var(--font-mono);
  line-height: 1.5;
  word-break: break-word;
}

@media (max-width: 768px) {
  .stats-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .stat-card { flex-direction: column; align-items: center; text-align: center; padding: 14px 10px; gap: 8px; }
  .stat-icon { width: 36px; height: 36px; font-size: 1.2rem; border-radius: 10px; }
  .stat-value { font-size: 1.25rem; }
  .stat-title { font-size: 0.82rem; }
  .stat-desc { display: none; }
  .action-grid { grid-template-columns: 1fr; }
  .action-card { flex-direction: column; }
  .action-buttons .btn-primary,
  .action-buttons .btn-secondary { width: 100%; }
  .io-grid { grid-template-columns: 1fr; }
  .io-card { padding: 16px; }
  .io-mini-icon { width: 36px; height: 36px; font-size: 1.1rem; }

  /* 移动端：错误弹窗占满宽度、列表紧凑 */
  :deep(.n-modal) { width: calc(100vw - 32px) !important; max-width: calc(100vw - 32px) !important; margin: 16px !important; }
  .errors-modal-body { max-height: 65vh; }
  .errors-hint { font-size: 0.8rem; padding: 8px 12px; }
  .error-item { padding: 10px 12px; }
  .error-link { font-size: 0.8rem; }
  .error-msg { font-size: 0.74rem; }
  .upload-grid { grid-template-columns: 1fr; }
  .upload-settings-card { padding: 16px; }
  .upload-group { padding: 14px; }
  .setting-row { flex-wrap: wrap; }
  .input-group { width: 100%; justify-content: space-between; }
  .setting-input { flex: 1; max-width: 120px; }
}

/* === GitHub 上传设置卡片 === */
.upload-settings-card .card-icon.upload {
  background: linear-gradient(135deg, rgba(79, 140, 255, 0.15) 0%, rgba(140, 108, 255, 0.15) 100%);
  position: relative;
}
.upload-settings-card .card-icon.upload .icon-ring {
  position: absolute;
  inset: -2px;
  border-radius: 14px;
  border: 2px solid rgba(79, 140, 255, 0.2);
  animation: pulse-ring 3s ease-in-out infinite;
}
@keyframes pulse-ring {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(1.05); }
}

.upload-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.upload-group {
  background: var(--color-card-soft);
  border: 1px solid var(--admin-border);
  border-radius: 16px;
  padding: 18px 20px;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.upload-group:hover {
  border-color: rgba(79, 140, 255, 0.25);
  box-shadow: 0 4px 16px rgba(79, 140, 255, 0.06);
}

.group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  padding-bottom: 10px;
  border-bottom: 1px dashed var(--admin-border);
}
.group-icon {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: var(--admin-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  flex-shrink: 0;
  color: #fff;
  box-shadow: 0 4px 12px rgba(79, 140, 255, 0.2);
}
.group-icon.timeout {
  background: linear-gradient(135deg, #f59e0b, #f97316);
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.25);
}
.group-icon.size {
  background: linear-gradient(135deg, #8b5cf6, #a855f7);
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.25);
}
.group-title {
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--text-main);
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.setting-row:last-child { margin-bottom: 0; }
.setting-row.disabled { opacity: 0.45; pointer-events: none; }

.setting-label {
  font-size: 0.84rem;
  color: var(--text-sec);
  font-weight: 500;
  white-space: nowrap;
}

.setting-hint {
  font-size: 0.74rem;
  color: var(--text-tertiary);
  margin: 6px 0 0;
  line-height: 1.4;
}

/* Toggle 开关 */
.toggle-wrap { position: relative; flex-shrink: 0; }
.toggle-input { display: none; }
.toggle-slider {
  display: block;
  width: 42px;
  height: 24px;
  background: #d1d5db;
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.25s;
  position: relative;
}
.toggle-slider::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  background: #fff;
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0,0,0,0.15);
  transition: transform 0.25s;
}
.toggle-input:checked + .toggle-slider {
  background: linear-gradient(135deg, #3478f6, #8b5cf6);
}
.toggle-input:checked + .toggle-slider::after {
  transform: translateX(18px);
}

/* 数字输入框 */
.input-group {
  display: flex;
  align-items: center;
  gap: 6px;
}
.setting-input {
  width: 72px;
  height: 34px;
  border: 1px solid var(--admin-border);
  border-radius: 10px;
  background: var(--admin-card);
  color: var(--text-main);
  font-size: 0.88rem;
  font-weight: 600;
  font-family: var(--font-mono);
  text-align: center;
  padding: 0 8px;
  transition: border-color 0.2s, box-shadow 0.2s;
  outline: none;
}
.setting-input:focus {
  border-color: #3478f6;
  box-shadow: 0 0 0 3px rgba(52, 120, 246, 0.12);
}
.setting-input:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.input-suffix {
  font-size: 0.78rem;
  color: var(--text-tertiary);
  font-weight: 500;
}

.upload-actions {
  margin-top: 18px;
  display: flex;
  justify-content: flex-end;
}
</style>
