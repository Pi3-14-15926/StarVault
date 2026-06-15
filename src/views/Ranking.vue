<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useProjectStore } from '../store/project'
import { useCategoryStore } from '../store/category'
import AmbientOrbs from '../components/AmbientOrbs.vue'
import { fmtDate, fmtCompact } from '../utils'
import { useIconUrl } from '../composables/useIconUrl'
import { latestVersionText, getSoftwarePlatforms, realDownloads, fmtRealDownloads } from '../utils/api'
import { platformClass, platformIcon } from '../utils/platformTag'
import { useEnabled } from '../composables/useEnabled'
import type { Software } from '../types'

const projects = useProjectStore()
const categories = useCategoryStore()
const route = useRoute()
const { resolveProject } = useIconUrl()
const { isProjectEnabled } = useEnabled()

/* 排序方式 */
type RankKey = 'stars' | 'downloads' | 'updated'
const validTab = (v: unknown): v is RankKey => ['stars', 'downloads', 'updated'].includes(v as string)
const rankKey = ref<RankKey>(validTab(route.query.tab) ? (route.query.tab as RankKey) : 'stars')
const rankOptions: { key: RankKey; label: string; icon: string }[] = [
  { key: 'stars', label: 'Star 榜', icon: '⭐' },
  { key: 'downloads', label: '下载榜', icon: '↓' },
  { key: 'updated', label: '最近更新', icon: '🆕' },
]

/* 真实下载量（仅 GitHub 来源有数据） */
function realDL(p: Software): number | null {
  return realDownloads(p)
}
function cmpRealDL(a: Software, b: Software): number {
  const va = realDL(a)
  const vb = realDL(b)
  if (va == null && vb == null) return 0
  if (va == null) return 1
  if (vb == null) return -1
  return vb - va
}

/* 排行榜数据 */
const ranked = computed(() => {
  const arr = [...projects.software].filter((p) => isProjectEnabled(p.id))
  if (rankKey.value === 'stars') {
    arr.sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))
  } else if (rankKey.value === 'downloads') {
    arr.sort(cmpRealDL)
  } else {
    arr.sort((a, b) => {
      const ta = a.latestUpdateTime ? new Date(a.latestUpdateTime).getTime() : 0
      const tb = b.latestUpdateTime ? new Date(b.latestUpdateTime).getTime() : 0
      return tb - ta
    })
  }
  return arr
})

/* 分页 */
const PAGE_SIZE = 5
const currentPage = ref(1)
watch(rankKey, () => { currentPage.value = 1 })
const totalPages = computed(() => Math.max(1, Math.ceil(ranked.value.length / PAGE_SIZE)))
const paged = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return ranked.value.slice(start, start + PAGE_SIZE)
})

const visiblePages = computed(() => {
  const total = totalPages.value
  const cur = currentPage.value
  const pages: number[] = []
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= cur - 1 && i <= cur + 1)) pages.push(i)
  }
  return pages
})
function goPage(n: number) {
  if (n < 1 || n > totalPages.value) return
  currentPage.value = n
  document.querySelector('.rank-main')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function categoryName(slug: string): string {
  return categories.categories.find(c => c.slug === slug)?.name || '未分类'
}

/* 软件真实支持的平台（最多 6 个） */
function platformsOf(s: Software, max = 6): string[] {
  return getSoftwarePlatforms(s.id).slice(0, max)
}
function platformsMore(s: Software, max = 6): number {
  return Math.max(0, getSoftwarePlatforms(s.id).length - max)
}

/* 顶部前三名用于大徽章展示 */
const topThree = computed(() => ranked.value.slice(0, 3))
const rest = computed(() => paged.value.filter((_, i) => (currentPage.value - 1) * PAGE_SIZE + i >= 3))

onMounted(() => {
  projects.refresh()
  categories.refresh()
})
</script>

<template>
  <AmbientOrbs />
  <div class="rank-page">
    <router-link to="/" class="back-link">← 返回</router-link>

    <!-- Hero 标题 -->
    <div class="rank-hero">
      <div class="hero-text">
        <span class="hero-tag">🏆 热门排行</span>
        <h1 class="hero-title">软件人气榜</h1>
        <p class="hero-desc">按 Star 数、下载量、更新时间综合排序，发现最受欢迎的优质软件</p>
      </div>
      <div class="hero-decoration" aria-hidden="true">
        <div class="deco-blob deco-blob-1"></div>
        <div class="deco-blob deco-blob-2"></div>
      </div>
    </div>

    <!-- 切换排序 -->
    <div class="rank-tabs">
      <button
        v-for="opt in rankOptions"
        :key="opt.key"
        :class="['rank-tab', { active: rankKey === opt.key }]"
        @click="rankKey = opt.key"
      >
        <span class="tab-icon">{{ opt.icon }}</span>
        <span>{{ opt.label }}</span>
      </button>
    </div>

    <!-- 前三 podium -->
    <div v-if="currentPage === 1 && topThree.length >= 3" class="podium">
      <div class="podium-item podium-2">
        <div class="podium-avatar">
          <img v-if="topThree[1].logo" :src="resolveProject(topThree[1])" :alt="topThree[1].name" />
          <span v-else>{{ topThree[1].name[0] }}</span>
        </div>
        <div class="podium-rank">2</div>
        <div class="podium-name">{{ topThree[1].name }}</div>
        <div class="podium-meta">{{ categoryName(topThree[1].categorySlug) }} · ⭐ {{ fmtCompact(topThree[1].stars ?? 0) }}</div>
        <router-link :to="`/software/${topThree[1].slug}`" class="podium-btn">查看</router-link>
      </div>
      <div class="podium-item podium-1">
        <div class="podium-avatar podium-avatar-lg">
          <img v-if="topThree[0].logo" :src="resolveProject(topThree[0])" :alt="topThree[0].name" />
          <span v-else>{{ topThree[0].name[0] }}</span>
        </div>
        <div class="podium-rank podium-rank-1">👑 1</div>
        <div class="podium-name podium-name-lg">{{ topThree[0].name }}</div>
        <div class="podium-meta">{{ categoryName(topThree[0].categorySlug) }} · ⭐ {{ fmtCompact(topThree[0].stars ?? 0) }}</div>
        <router-link :to="`/software/${topThree[0].slug}`" class="podium-btn podium-btn-primary">查看</router-link>
      </div>
      <div class="podium-item podium-3">
        <div class="podium-avatar">
          <img v-if="topThree[2].logo" :src="resolveProject(topThree[2])" :alt="topThree[2].name" />
          <span v-else>{{ topThree[2].name[0] }}</span>
        </div>
        <div class="podium-rank">3</div>
        <div class="podium-name">{{ topThree[2].name }}</div>
        <div class="podium-meta">{{ categoryName(topThree[2].categorySlug) }} · ⭐ {{ fmtCompact(topThree[2].stars ?? 0) }}</div>
        <router-link :to="`/software/${topThree[2].slug}`" class="podium-btn">查看</router-link>
      </div>
    </div>

    <!-- 列表 -->
    <div class="rank-main">
      <div v-if="paged.length === 0" class="empty-state">暂无数据</div>
      <div v-else class="cat-list">
        <router-link
          v-for="(p, i) in paged"
          :key="p.id"
          :to="`/software/${p.slug}`"
          class="cat-row cat-row--rank"
        >
          <div class="cr-header">
            <div class="cr-rank-num" :class="{ 'cr-rank-top': (currentPage - 1) * PAGE_SIZE + i < 3 }">
              {{ (currentPage - 1) * PAGE_SIZE + i + 1 }}
            </div>
            <div class="cr-icon">
              <img v-if="p.logo" :src="resolveProject(p)" :alt="p.name" />
              <span v-else>{{ p.name[0] }}</span>
            </div>
            <div class="cr-title-block">
              <span class="cr-name">{{ p.name }}</span>
              <div class="cr-subtitle">
                <span v-if="p.stars" class="cr-stars">⭐ {{ p.stars.toFixed(1) }}</span>
                <span v-if="latestVersionText(p)" class="cr-version">{{ latestVersionText(p) }}</span>
              </div>
            </div>
          </div>
          <div v-if="platformsOf(p).length" class="cr-platforms">
            <span
              v-for="pl in platformsOf(p)"
              :key="pl"
              :class="['cr-plat-tag', platformClass(pl)]"
              :title="`支持 ${pl}`"
            >
              <span>{{ platformIcon(pl) }}</span>{{ pl }}
            </span>
            <span v-if="platformsMore(p) > 0" class="cr-plat-more">+{{ platformsMore(p) }}</span>
          </div>
          <div class="cr-desc">{{ p.description }}</div>
          <div class="cr-extra">
            <span v-if="p.stars !== undefined" class="extra-pill">⭐ {{ fmtCompact(p.stars ?? 0) }} Stars</span>
            <span v-if="fmtRealDownloads(p) !== '—'" class="extra-pill">↓ {{ fmtRealDownloads(p) }} 下载</span>
            <span v-if="p.latestUpdateTime" class="extra-pill extra-pill-mono">{{ fmtDate(p.latestUpdateTime) }}</span>
          </div>
          <div class="cr-meta">
            <span class="cr-meta-tag">release</span>
            <span v-if="p.latestUpdateTime" class="cr-meta-date">{{ fmtDate(p.latestUpdateTime) }} 更新</span>
          </div>
        </router-link>
      </div>

      <!-- 分页 -->
      <div v-if="totalPages > 1" class="pagination">
        <span class="page-info">共 {{ totalPages }} 页</span>
        <div class="page-btns">
          <button class="page-btn" :disabled="currentPage === 1" @click="goPage(currentPage - 1)">‹</button>
          <template v-for="(n, idx) in visiblePages" :key="n + '-' + idx">
            <span
              v-if="idx > 0 && visiblePages[idx - 1] !== n - 1"
              class="page-ellipsis"
            >…</span>
            <button
              :class="['page-btn', { active: currentPage === n }]"
              @click="goPage(n)"
            >{{ n }}</button>
          </template>
          <button class="page-btn" :disabled="currentPage === totalPages" @click="goPage(currentPage + 1)">›</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rank-page {
  max-width: 1180px;
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

/* === Hero === */
.rank-hero {
  position: relative;
  padding: 32px;
  background: var(--gradient-hero-soft);
  border-radius: var(--radius-2xl);
  overflow: hidden;
  box-shadow: var(--shadow-md);
  margin-bottom: 20px;
}
.hero-text { position: relative; z-index: 1; }
.hero-tag {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 14px;
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.5);
  backdrop-filter: blur(8px);
  color: var(--text-main);
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 12px;
}
.hero-title {
  font-size: clamp(1.6rem, 2vw + 0.8rem, 2.2rem);
  font-weight: 700;
  color: var(--text-main);
  margin: 0 0 6px;
  letter-spacing: -0.5px;
}
.hero-desc {
  font-size: 0.95rem;
  color: var(--text-sec);
  margin: 0;
  line-height: 1.5;
}
.hero-decoration { position: absolute; inset: 0; pointer-events: none; }
.deco-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(40px);
  opacity: 0.55;
}
.deco-blob-1 {
  width: 240px; height: 240px;
  top: -80px; right: -40px;
  background: radial-gradient(circle, rgba(140, 108, 255, 0.55) 0%, transparent 70%);
}
.deco-blob-2 {
  width: 200px; height: 200px;
  bottom: -60px; right: 120px;
  background: radial-gradient(circle, rgba(52, 120, 246, 0.5) 0%, transparent 70%);
}

/* === 切换 Tab === */
.rank-tabs {
  display: flex;
  gap: 4px;
  background: var(--color-card);
  padding: 6px;
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-xs);
  border: 1px solid var(--border-soft);
  margin-bottom: 24px;
  width: fit-content;
  max-width: 100%;
  overflow-x: auto;
}
.rank-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 18px;
  border: none;
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--text-sec);
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.18s, color 0.18s;
}
.rank-tab:hover { color: var(--text-main); }
.rank-tab.active {
  background: var(--gradient-primary);
  color: white;
  font-weight: 600;
  box-shadow: var(--shadow-primary);
}
.tab-icon { font-size: 0.95em; }

/* === 前三 podium === */
.podium {
  display: grid;
  grid-template-columns: 1fr 1.2fr 1fr;
  gap: 16px;
  margin-bottom: 28px;
  align-items: end;
}
.podium-item {
  background: var(--color-card);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  padding: 20px 16px;
  text-align: center;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  position: relative;
}
.podium-1 {
  padding: 28px 16px;
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.12) 0%, rgba(255, 165, 0, 0.06) 100%);
  border-color: rgba(255, 215, 0, 0.4);
  box-shadow: 0 10px 30px rgba(255, 165, 0, 0.18);
  transform: translateY(-12px);
}
.podium-avatar {
  width: 60px;
  height: 60px;
  border-radius: var(--radius-md);
  background: var(--gradient-primary-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary);
  font-weight: 700;
  font-size: 1.6rem;
  overflow: hidden;
}
.podium-avatar-lg { width: 84px; height: 84px; font-size: 2.2rem; }
.podium-avatar img { width: 100%; height: 100%; object-fit: cover; }
.podium-rank {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--color-card-soft);
  color: var(--text-tertiary);
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
}
.podium-rank-1 {
  background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
  color: white;
  font-size: 0.78rem;
  padding: 0 8px;
  width: auto;
  border-radius: var(--radius-full);
}
.podium-name {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-main);
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.podium-name-lg { font-size: 1.1rem; }
.podium-meta {
  font-size: 0.78rem;
  color: var(--text-tertiary);
}
.podium-btn {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 14px;
  border-radius: var(--radius-full);
  background: var(--color-card-soft);
  color: var(--text-sec);
  font-size: 0.8rem;
  font-weight: 600;
  text-decoration: none;
  transition: background 0.18s, color 0.18s;
}
.podium-btn:hover { background: var(--color-primary-soft); color: var(--color-primary); }
.podium-btn-primary {
  background: var(--gradient-primary);
  color: white;
  box-shadow: var(--shadow-primary);
}
.podium-btn-primary:hover { background: var(--gradient-primary); color: white; opacity: 0.92; }

/* === 列表 === */
.rank-main { min-width: 0; }
.empty-state {
  text-align: center;
  color: var(--text-tertiary);
  padding: 40px 0;
  font-size: 0.9rem;
}
.cat-list { display: flex; flex-direction: column; gap: 12px; }
.cat-row {
  display: flex;
  flex-direction: column;
  padding: 16px;
  background: var(--color-card);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  text-decoration: none;
  color: inherit;
  box-shadow: var(--shadow-xs);
  transition: transform 0.18s, box-shadow 0.18s, border-color 0.18s;
  gap: 10px;
}
.cat-row:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
  border-color: var(--color-primary);
}

/* Header: rank + icon + title */
.cr-header {
  display: flex;
  align-items: center;
  gap: 10px;
}
.cr-rank-num {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--color-card-soft);
  color: var(--text-tertiary);
  font-size: 0.8rem;
  font-weight: 700;
  flex-shrink: 0;
}
.cr-rank-num.cr-rank-top {
  background: var(--gradient-primary);
  color: white;
}
.cr-icon {
  width: 52px;
  height: 52px;
  border-radius: var(--radius-md);
  background: var(--gradient-primary-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary);
  font-weight: 700;
  font-size: 1.3rem;
  flex-shrink: 0;
  overflow: hidden;
}
.cr-icon img { width: 100%; height: 100%; object-fit: cover; }
.cr-title-block {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.cr-name {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-main);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cr-subtitle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.82rem;
}
.cr-stars {
  color: #F5A623;
  font-weight: 600;
}
.cr-version {
  color: var(--color-primary);
  font-weight: 500;
  font-family: var(--font-mono);
  background: var(--color-primary-soft);
  padding: 0 6px;
  border-radius: var(--radius-full);
  font-size: 0.75rem;
}

/* Platforms */
.cr-platforms {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.cr-plat-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 0.72rem;
  background: var(--color-card-soft);
  color: var(--text-sec);
  border: 1px solid var(--border-soft);
  line-height: 1.2;
}
.cr-plat-tag span:first-child { font-size: 0.7rem; }
.cr-plat-more {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 6px;
  font-size: 0.65rem;
  background: var(--color-card-soft);
  color: var(--text-tertiary);
  border: 1px dashed var(--border-soft);
  border-radius: 999px;
}

/* Description */
.cr-desc {
  font-size: 0.85rem;
  color: var(--text-sec);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

/* Extra pills */
.cr-extra {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.extra-pill {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border-radius: var(--radius-full);
  background: var(--color-card-soft);
  color: var(--text-sec);
  font-size: 0.72rem;
  font-weight: 500;
}
.extra-pill-mono { font-family: var(--font-mono); }

/* Meta */
.cr-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.cr-meta-tag {
  font-size: 0.7rem;
  color: var(--text-tertiary);
  background: var(--color-card-soft);
  padding: 2px 8px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-soft);
}
.cr-meta-date {
  font-size: 0.7rem;
  color: var(--text-tertiary);
  white-space: nowrap;
  font-family: var(--font-mono);
}

/* Keep plat-tag for compatibility */
.plat-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 0.72rem;
  background: var(--color-card-soft);
  color: var(--text-sec);
  border: 1px solid var(--border-soft);
}
.plat-tag span:first-child { font-size: 0.7rem; }

/* === 分页 === */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 20px;
}
.page-info {
  font-size: 0.82rem;
  color: var(--text-tertiary);
  margin-right: 6px;
  font-family: var(--font-mono);
}
.page-btn {
  min-width: 32px;
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-md);
  background: var(--color-card);
  color: var(--text-sec);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.page-btn:hover:not(:disabled) {
  background: var(--color-card-soft);
  color: var(--text-main);
  border-color: var(--border-color);
}
.page-btn.active {
  background: var(--gradient-primary);
  color: white;
  border-color: transparent;
  box-shadow: var(--shadow-primary);
  font-weight: 600;
}
.page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.page-ellipsis {
  min-width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 0.9rem;
  cursor: default;
}

@media (max-width: 768px) {
  .pagination { justify-content: flex-start; }
  .page-btns { display: flex; align-items: center; gap: 6px; flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; }
  .page-btn { min-width: 28px; height: 28px; font-size: 0.78rem; padding: 0 6px; }
  .podium { grid-template-columns: 1fr 1.1fr 1fr; gap: 8px; }
  .podium-item { padding: 14px 8px; }
  .podium-1 { padding: 18px 8px; }
  .podium-avatar { width: 48px; height: 48px; font-size: 1.3rem; }
  .podium-avatar-lg { width: 64px; height: 64px; font-size: 1.8rem; }
  .podium-name { font-size: 0.85rem; }
  .podium-meta { font-size: 0.7rem; }
  .podium-btn { height: 24px; padding: 0 10px; font-size: 0.72rem; }
  /* 平板模式：标签与 ProjectCard 热门卡片对齐，一行至少 3 个 */
  .cr-platforms { gap: 2px; }
  .cr-plat-tag {
    height: 10px;
    padding: 0 2px;
    border-radius: 2px;
    font-size: 0.33rem;
    gap: 1px;
  }
  .cr-plat-more {
    height: 10px;
    padding: 0 2px;
    font-size: 0.33rem;
  }
}
@media (max-width: 480px) {
  .cr-rank-num { width: 22px; height: 22px; font-size: 0.72rem; }
  .cr-icon { width: 44px; height: 44px; font-size: 1.1rem; }
  .cr-name { font-size: 0.92rem; }
  .cr-desc { font-size: 0.8rem; -webkit-line-clamp: 2; }
  .cr-extra { display: none; }
  .cr-platforms { gap: 2px; min-height: 10px; }
  .cr-plat-tag {
    height: 10px;
    padding: 0 2px;
    border-radius: 2px;
    font-size: 0.33rem;
    gap: 1px;
  }
  .cr-plat-more {
    height: 10px;
    padding: 0 2px;
    font-size: 0.33rem;
  }
}
@media (max-width: 640px) {
  .cat-row { padding: 12px; gap: 8px; }
  .cr-rank-num { width: 22px; height: 22px; font-size: 0.72rem; }
  .cr-icon { width: 44px; height: 44px; font-size: 1.1rem; }
  .cr-name { font-size: 0.92rem; }
  .cr-desc { font-size: 0.8rem; -webkit-line-clamp: 2; }
  .cr-extra { display: none; }
  .cr-platforms { gap: 4px; }
  .cr-plat-tag { padding: 2px 8px; font-size: 0.68rem; }
}
</style>
