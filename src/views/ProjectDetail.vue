<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProjectStore } from '../store/project'
import { useCategoryStore } from '../store/category'
import { useSettingStore } from '../store/settings'
import { fmtDate, relTime, fmtCompact } from '../utils'
import { useIconUrl } from '../composables/useIconUrl'
import { getSoftwareVersions, getVersionDownloads } from '../utils/api'
import { platformClass, platformIcon } from '../utils/platformTag'
import { useEnabled } from '../composables/useEnabled'
import AmbientOrbs from '../components/AmbientOrbs.vue'
import type { Version, Download } from '../types'

const route = useRoute()
const router = useRouter()
const projects = useProjectStore()
const categories = useCategoryStore()
const settings = useSettingStore()
const { resolveProject } = useIconUrl()
const { isProjectEnabled } = useEnabled()

const GH_PROXY_KEY = 'sh_use_gh_proxy'
const useGhProxy = ref(JSON.parse(localStorage.getItem(GH_PROXY_KEY) ?? 'true'))
function toggleGhProxy() {
  useGhProxy.value = !useGhProxy.value
  localStorage.setItem(GH_PROXY_KEY, JSON.stringify(useGhProxy.value))
}
const ghProxyEnabled = computed(() => !!settings.settings.ghProxyEnabled && !!settings.settings.ghProxyUrl)
const ghProxyUrl = computed(() => {
  const url = settings.settings.ghProxyUrl || ''
  return url.endsWith('/') ? url : url + '/'
})
function isGitHubUrl(url: string): boolean {
  return url.includes('github.com') || url.includes('githubusercontent.com')
}
function proxyUrl(url: string): string {
  if (!useGhProxy.value || !ghProxyEnabled.value) return url
  if (!isGitHubUrl(url)) return url
  return ghProxyUrl.value + url
}

const project = computed(() => {
  const p = projects.bySlug(route.params.slug as string)
  return p && isProjectEnabled(p.id) ? p : null
})
const projectLogo = computed(() => resolveProject(project.value))
const category = computed(() =>
  project.value ? categories.categories.find((c) => c.slug === project.value!.categorySlug) : null,
)

const allVersions = computed<Version[]>(() => project.value ? getSoftwareVersions(project.value.id) : [])

const expanded = ref(false)
const showAllLatestDownloads = ref(false)
const expandedHistory = ref<Set<string>>(new Set())
const latestVer = computed<Version | null>(() => allVersions.value[0] ?? null)
const historyVers = computed<Version[]>(() => allVersions.value.slice(1))

/* === 排序：默认大小降序 === */
type SortKey = 'size-desc' | 'size-asc' | 'name-asc' | 'name-desc'
const sortKey = ref<SortKey>('size-desc')
const sortOptions: { value: SortKey; label: string }[] = [
  { value: 'size-desc', label: '大小 ↓' },
  { value: 'size-asc',  label: '大小 ↑' },
  { value: 'name-asc',  label: '名称 A→Z' },
  { value: 'name-desc', label: '名称 Z→A' },
]

function parseSize(s: string): number {
  const m = s.match(/([\d.]+)\s*(B|KB|MB|GB|TB)/i)
  if (!m) return 0
  const v = parseFloat(m[1])
  const u = m[2].toUpperCase()
  const mult: Record<string, number> = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 }
  return v * (mult[u] || 1)
}

function sortDownloads(list: Download[]): Download[] {
  const arr = [...list]
  switch (sortKey.value) {
    case 'size-desc': arr.sort((a, b) => parseSize(b.size) - parseSize(a.size)); break
    case 'size-asc':  arr.sort((a, b) => parseSize(a.size) - parseSize(b.size)); break
    case 'name-asc':  arr.sort((a, b) => a.filename.localeCompare(b.filename)); break
    case 'name-desc': arr.sort((a, b) => b.filename.localeCompare(a.filename)); break
  }
  return arr
}

function downloadsOf(v: Version): Download[] {
  return getVersionDownloads(v.id)
}

/* 最新版本下载：超过 5 个时默认折叠 */
const DOWNLOAD_LIMIT = 5
const HISTORY_DL_LIMIT = 3
const latestDownloads = computed<Download[]>(() =>
  latestVer.value ? sortDownloads(downloadsOf(latestVer.value)) : [],
)
const visibleDownloads = computed(() => {
  if (showAllLatestDownloads.value) return latestDownloads.value
  return latestDownloads.value.slice(0, DOWNLOAD_LIMIT)
})
const hiddenDownloadCount = computed(() => Math.max(0, latestDownloads.value.length - DOWNLOAD_LIMIT))

/* 历史版本下载：超过 3 个时默认折叠 */
function visibleHistoryDownloads(v: Version): Download[] {
  const dls = sortDownloads(downloadsOf(v))
  if (expandedHistory.value.has(v.id)) return dls
  return dls.slice(0, HISTORY_DL_LIMIT)
}
function hiddenHistoryDownloadCount(v: Version): number {
  return Math.max(0, downloadsOf(v).length - HISTORY_DL_LIMIT)
}
function toggleHistoryDownloads(v: Version) {
  if (expandedHistory.value.has(v.id)) expandedHistory.value.delete(v.id)
  else expandedHistory.value.add(v.id)
}
</script>

<template>
  <AmbientOrbs />
  <div class="detail-page">
    <router-link to="/" class="back-link">← 返回首页</router-link>

    <div v-if="!project" class="not-found">
      <div class="not-found-icon">🔍</div>
      <p>项目未找到，请检查链接是否正确</p>
      <button class="btn-primary" @click="router.push('/')">返回首页</button>
    </div>

    <template v-else>
      <!-- 项目头部 -->
      <div class="detail-hero">
        <div class="hero-info">
          <div class="project-avatar">
            <img v-if="projectLogo" :src="projectLogo" :alt="project.name" />
            <span v-else>{{ project.name[0] }}</span>
          </div>
          <div class="hero-meta">
            <h1 class="project-name">{{ project.name }}</h1>
            <p class="project-desc">{{ project.description }}</p>
            <div class="project-tags">
              <span v-if="category" class="tag tag-blue">📂 {{ category.name }}</span>
              <span v-if="project.stars !== undefined" class="tag tag-orange">⭐ {{ fmtCompact(project.stars) }}</span>
              <span v-if="project.forks !== undefined && project.forks > 0" class="tag">🍴 {{ fmtCompact(project.forks) }}</span>
              <a
                v-if="project.githubRepo"
                :href="`https://github.com/${project.githubRepo}`"
                target="_blank"
                rel="noopener noreferrer"
                class="tag tag-purple github-link"
              >
                GitHub ↗
              </a>
            </div>
          </div>
        </div>
        <div class="hero-decoration" aria-hidden="true">
          <div class="deco-blob deco-blob-1"></div>
          <div class="deco-blob deco-blob-2"></div>
        </div>
      </div>

      <!-- 关联文章 -->
      <div v-if="project.relatedArticles && project.relatedArticles.length > 0" class="related-articles-card">
        <div class="related-articles-head">
          <svg class="related-articles-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
          <span class="related-articles-title">关联文章</span>
        </div>
        <div class="related-articles-list">
          <a
            v-for="(article, index) in project.relatedArticles"
            :key="index"
            :href="article.url"
            target="_blank"
            rel="noopener noreferrer"
            class="related-article-item"
          >
            <span class="related-article-name">{{ article.name }}</span>
            <svg class="related-article-arrow" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"/>
              <polyline points="12 5 19 12 12 19"/>
            </svg>
          </a>
        </div>
      </div>

      <!-- 下载加速开关 -->
      <div v-if="ghProxyEnabled" class="proxy-bar" @click="toggleGhProxy">
        <div class="proxy-info">
          <span class="proxy-icon">🚀</span>
          <div class="proxy-text">
            <span class="proxy-label">下载加速</span>
            <span class="proxy-desc">开启后所有 GitHub Release 下载链接将通过代理服务加速下载</span>
          </div>
        </div>
        <div :class="['proxy-toggle', { on: useGhProxy }]">
          <div class="proxy-knob"></div>
        </div>
      </div>

      <!-- 最新版本 -->
      <div v-if="latestVer" class="detail-card">
        <div class="card-head">
          <h2 class="card-title">最新版本</h2>
          <span class="release-date">
            {{ fmtDate(latestVer.publishedAt) }} · {{ relTime(latestVer.publishedAt) }}
          </span>
        </div>
        <div class="version-tag">
          <span class="version-label">版本</span>
          <span class="version-num">{{ latestVer.version }}</span>
        </div>
        <div v-if="latestVer.changelog" class="release-notes">
          <pre>{{ latestVer.changelog }}</pre>
        </div>
        <div class="list-head">
          <span class="list-label">资源列表</span>
          <select v-model="sortKey" class="sort-select" title="排序方式">
            <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>
        <div class="download-list">
          <a
            v-for="dl in visibleDownloads"
            :key="dl.id"
            :href="proxyUrl(dl.url)"
            target="_blank"
            rel="noopener noreferrer"
            class="download-btn"
          >
            <span :class="['plat-tag', platformClass(dl.platform)]" :title="dl.platform">
              <span>{{ platformIcon(dl.platform) }}</span>{{ dl.platform }}
            </span>
            <span class="apk-name">{{ dl.filename }}</span>
            <span class="apk-size">{{ dl.size }}</span>
            <span :class="['apk-dl', dl.downloadCount == null ? 'apk-dl-empty' : '']" :title="dl.downloadCount != null ? `真实下载 ${dl.downloadCount}（GitHub）` : '非 GitHub 来源'">
              ↓ {{ dl.downloadCount != null ? fmtCompact(dl.downloadCount) : '—' }}
            </span>
          </a>
          <div v-if="latestDownloads.length === 0" class="empty-state">该版本暂无文件</div>
        </div>
        <div v-if="hiddenDownloadCount > 0" class="dl-more">
          <button v-if="!showAllLatestDownloads" class="more-btn" @click="showAllLatestDownloads = true">
            展开更多下载资源 <span class="more-badge">+{{ hiddenDownloadCount }}</span>
          </button>
          <button v-else class="more-btn more-btn-collapse" @click="showAllLatestDownloads = false">
            收起
          </button>
        </div>
      </div>

      <!-- 历史版本 -->
      <div v-if="historyVers.length > 0" class="detail-card">
        <button class="history-toggle" @click="expanded = !expanded">
          <span>📜 历史版本 ({{ historyVers.length }})</span>
          <span class="toggle-icon">{{ expanded ? '▲' : '▼' }}</span>
        </button>
        <div v-if="expanded" class="history-list">
          <div v-for="v in historyVers" :key="v.id" class="history-item">
            <div class="history-head">
              <span class="version-tag-mini">{{ v.version }}</span>
              <span class="release-date">{{ fmtDate(v.publishedAt) }}</span>
            </div>
            <div v-if="v.changelog" class="release-notes-mini">
              <pre>{{ v.changelog }}</pre>
            </div>
            <div class="list-head list-head-sm">
              <span class="list-label list-label-sm">资源列表</span>
              <select v-model="sortKey" class="sort-select sort-select-sm" title="排序方式">
                <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </div>
            <div class="download-list">
              <a
                v-for="dl in visibleHistoryDownloads(v)"
                :key="dl.id"
                :href="proxyUrl(dl.url)"
                target="_blank"
                rel="noopener noreferrer"
                class="download-btn download-btn-sm"
              >
                <span :class="['plat-tag', 'plat-tag-sm', platformClass(dl.platform)]" :title="dl.platform">
                  <span>{{ platformIcon(dl.platform) }}</span>{{ dl.platform }}
                </span>
                <span class="apk-name">{{ dl.filename }}</span>
                <span class="apk-size">{{ dl.size }}</span>
                <span :class="['apk-dl', 'apk-dl-sm', dl.downloadCount == null ? 'apk-dl-empty' : '']" :title="dl.downloadCount != null ? `真实下载 ${dl.downloadCount}（GitHub）` : '非 GitHub 来源'">
                  ↓ {{ dl.downloadCount != null ? fmtCompact(dl.downloadCount) : '—' }}
                </span>
              </a>
            </div>
            <div v-if="downloadsOf(v).length > HISTORY_DL_LIMIT" class="dl-more">
              <button
                v-if="!expandedHistory.has(v.id)"
                class="more-btn more-btn-sm"
                @click="toggleHistoryDownloads(v)"
              >
                展开更多 <span class="more-badge">+{{ hiddenHistoryDownloadCount(v) }}</span>
              </button>
              <button v-else class="more-btn more-btn-sm more-btn-collapse" @click="toggleHistoryDownloads(v)">
                收起
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.detail-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 0 16px;
  position: relative;
  z-index: 1;
}

.back-link {
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 14px;
  border-radius: var(--radius-full);
  background: var(--color-card);
  color: var(--text-sec);
  font-size: 0.85rem;
  text-decoration: none;
  box-shadow: var(--shadow-xs);
  margin-bottom: 16px;
  transition: background 0.18s, color 0.18s;
}
.back-link:hover { background: var(--color-card-soft); color: var(--text-main); }

/* === 详情 Hero === */
.detail-hero {
  position: relative;
  padding: 32px;
  background: var(--gradient-hero-soft);
  border-radius: var(--radius-2xl);
  overflow: hidden;
  box-shadow: var(--shadow-md);
  margin-bottom: 20px;
}
.hero-info {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 24px;
}
.project-avatar {
  width: 88px;
  height: 88px;
  border-radius: var(--radius-xl);
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 2.6rem;
  color: var(--color-primary);
  flex-shrink: 0;
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}
.project-avatar img { width: 100%; height: 100%; object-fit: cover; }
.hero-meta { flex: 1; }
.project-name {
  font-size: clamp(1.5rem, 2vw + 0.8rem, 2rem);
  font-weight: 700;
  color: var(--text-main);
  margin: 0 0 6px;
  line-height: 1.2;
}
.project-desc {
  font-size: 0.95rem;
  color: var(--text-sec);
  margin: 0 0 14px;
  line-height: 1.5;
}
.project-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.github-link { text-decoration: none; }

/* === 下载加速开关 === */
.proxy-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  background: var(--color-card);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  margin-bottom: 16px;
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
  user-select: none;
  animation: riseFade 0.4s ease both;
  animation-delay: 0.05s;
}
.proxy-bar:hover {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-soft);
}
.proxy-info {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.proxy-icon {
  font-size: 1.4rem;
  flex-shrink: 0;
}
.proxy-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.proxy-label {
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--text-main);
}
.proxy-desc {
  font-size: 0.78rem;
  color: var(--text-tertiary);
}
.proxy-toggle {
  position: relative;
  width: 44px;
  height: 24px;
  border-radius: 12px;
  background: var(--border-color);
  flex-shrink: 0;
  transition: background 0.25s ease;
}
.proxy-toggle.on {
  background: var(--gradient-primary);
}
.proxy-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
  transition: transform 0.25s ease;
}
.proxy-toggle.on .proxy-knob {
  transform: translateX(20px);
}

/* === 详情卡片 === */
.detail-card {
  background: var(--color-card);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  padding: 20px;
  box-shadow: var(--shadow-sm);
  margin-bottom: 16px;
  animation: riseFade 0.4s ease both;
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  flex-wrap: wrap;
  gap: 8px;
}
.card-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
}
.release-date {
  font-size: 0.85rem;
  color: var(--text-tertiary);
}

.version-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px 4px 4px;
  border-radius: var(--radius-full);
  background: var(--gradient-primary-soft);
  margin-bottom: 14px;
}
.version-label {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  background: var(--gradient-primary);
  color: white;
  border-radius: var(--radius-full);
  font-size: 0.7rem;
  font-weight: 600;
}
.version-num {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--color-primary);
  font-family: var(--font-mono);
}

.release-notes {
  background: var(--color-card-soft);
  padding: 12px 14px;
  border-radius: var(--radius-md);
  font-size: 0.88rem;
  color: var(--text-sec);
  max-height: 200px;
  overflow-y: auto;
  margin-bottom: 14px;
  border-left: 3px solid var(--color-primary);
  scrollbar-width: thin;
  word-break: break-word;
}
.release-notes pre {
  margin: 0;
  font-family: inherit;
  white-space: pre-wrap;
  line-height: 1.6;
}
.release-notes::-webkit-scrollbar { width: 4px; }
.release-notes::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 2px; }

.download-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.list-label {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 12px;
  border-radius: var(--radius-full);
  background: var(--gradient-primary-soft);
  color: var(--color-primary);
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.2px;
}
.list-label-sm {
  height: 22px;
  padding: 0 10px;
  font-size: 0.72rem;
}
.list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.list-head-sm { margin-bottom: 8px; }

.sort-select {
  height: 24px;
  padding: 0 8px;
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-full);
  background: var(--color-card-soft);
  color: var(--text-sec);
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  outline: none;
  transition: border-color 0.15s;
}
.sort-select:hover { border-color: var(--color-primary); }
.sort-select:focus { border-color: var(--color-primary); }
.sort-select-sm { height: 22px; font-size: 0.7rem; padding: 0 6px; }
.download-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--gradient-primary);
  color: var(--text-on-primary);
  text-decoration: none;
  padding: 12px 16px;
  border-radius: var(--radius-md);
  font-weight: 600;
  transition: transform 0.15s, box-shadow 0.18s;
  font-size: 0.92rem;
  box-shadow: var(--shadow-primary);
}
.download-btn:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-primary-hover);
}
.download-btn-sm { padding: 9px 14px; font-size: 0.85rem; }
.apk-name {
  font-family: var(--font-mono);
  font-size: 0.88rem;
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.download-btn .plat-tag { flex-shrink: 0; }
.download-btn-sm .plat-tag-sm {
  height: 16px;
  padding: 0 5px;
  border-radius: 5px;
  font-size: 0.58rem;
  gap: 1px;
}
.apk-size {
  font-size: 0.78rem;
  opacity: 0.92;
  white-space: nowrap;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.22);
  padding: 2px 8px;
  border-radius: var(--radius-full);
}
.apk-dl {
  font-size: 0.76rem;
  white-space: nowrap;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.18);
  padding: 2px 8px;
  border-radius: var(--radius-full);
  color: #FFFFFF;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.apk-dl-empty {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.6);
  font-weight: 500;
}
.apk-dl-sm { font-size: 0.7rem; padding: 1px 6px; }

.empty-state {
  text-align: center;
  color: var(--text-tertiary);
  font-size: 0.9rem;
  padding: 24px;
  background: var(--color-card-soft);
  border-radius: var(--radius-md);
  border: 1px dashed var(--border-color);
}

/* === 展开更多下载 === */
.dl-more {
  margin-top: 10px;
  display: flex;
  justify-content: center;
}
.more-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 38px;
  padding: 0 20px;
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-full);
  background: var(--color-card-soft);
  color: var(--text-sec);
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.18s, color 0.18s, border-color 0.18s;
}
.more-btn:hover {
  background: var(--color-primary-soft);
  color: var(--color-primary);
  border-color: var(--color-primary);
}
.more-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: var(--radius-full);
  background: var(--gradient-primary);
  color: white;
  font-size: 0.7rem;
  font-weight: 700;
}
.more-btn-collapse { color: var(--text-tertiary); }
.more-btn-sm { height: 30px; padding: 0 14px; font-size: 0.78rem; }

/* === 历史版本 === */
.history-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border: none;
  background: var(--color-card-soft);
  color: var(--text-main);
  border-radius: var(--radius-md);
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.18s;
}
.history-toggle:hover { background: var(--color-card-soft); }
.toggle-icon { color: var(--text-tertiary); font-size: 0.85rem; }
.history-list { margin-top: 12px; display: flex; flex-direction: column; gap: 10px; }
.history-item {
  background: var(--color-card-soft);
  padding: 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-soft);
}
.history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.version-tag-mini {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 10px;
  border-radius: var(--radius-full);
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: 0.8rem;
  font-weight: 600;
  font-family: var(--font-mono);
}
.release-notes-mini {
  background: var(--color-card);
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  font-size: 0.82rem;
  color: var(--text-sec);
  max-height: 120px;
  overflow-y: auto;
  margin-bottom: 10px;
  border-left: 2px solid var(--color-primary);
}
.release-notes-mini pre { margin: 0; font-family: inherit; white-space: pre-wrap; line-height: 1.5; }

.not-found {
  text-align: center;
  padding: 80px 20px;
  color: var(--text-tertiary);
}
.not-found-icon { font-size: 3rem; margin-bottom: 16px; }
.not-found p { margin: 0 0 20px; }

/* 响应式 */
@media (max-width: 768px) {
  .detail-hero { padding: 20px; }
  .hero-info { flex-direction: column; align-items: flex-start; gap: 14px; }
  .project-avatar { width: 64px; height: 64px; font-size: 2rem; }
  .project-name { font-size: 1.4rem; }
  .related-articles-card { padding: 16px; }
}
@media (max-width: 480px) {
  .download-btn { padding: 8px 10px; flex-wrap: wrap; font-size: 0.82rem; gap: 6px; }
  .download-btn .plat-tag { width: 100%; font-size: 0.72rem; height: 20px; padding: 0 6px; }
  .apk-name { font-size: 0.78rem; width: 100%; white-space: normal; word-break: break-all; }
  .apk-size, .apk-dl { font-size: 0.7rem; padding: 1px 6px; flex-shrink: 0; }
  .download-btn-sm { padding: 6px 8px; flex-wrap: wrap; font-size: 0.78rem; gap: 5px; }
  .download-btn-sm .plat-tag-sm { width: 100%; font-size: 0.65rem; height: 18px; padding: 0 5px; }
}

/* === 关联文章卡片 === */
.related-articles-card {
  background: var(--color-card);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  margin-bottom: 16px;
  padding: 20px;
  animation: riseFade 0.4s ease both;
  animation-delay: 0.1s;
}
.related-articles-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
}
.related-articles-icon {
  color: var(--color-primary);
}
.related-articles-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-main);
}
.related-articles-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.related-article-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  background: var(--gradient-primary-soft);
  border: 1px solid rgba(52, 120, 246, 0.1);
  border-radius: var(--radius-md);
  text-decoration: none;
  transition: all 0.2s ease;
}
.related-article-item:hover {
  border-color: var(--color-primary);
  box-shadow: 0 4px 12px rgba(52, 120, 246, 0.15);
  transform: translateY(-1px);
}
.related-article-name {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--color-primary);
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.related-article-arrow {
  color: var(--color-primary);
  flex-shrink: 0;
  opacity: 0.6;
  transition: opacity 0.2s, transform 0.2s;
}
.related-article-item:hover .related-article-arrow {
  opacity: 1;
  transform: translateX(3px);
}
</style>
