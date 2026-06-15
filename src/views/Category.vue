<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProjectStore } from '../store/project'
import { useCategoryStore } from '../store/category'
import AmbientOrbs from '../components/AmbientOrbs.vue'
import { fmtDate } from '../utils'
import { useIconUrl } from '../composables/useIconUrl'
import { getVersionById, getSoftwarePlatforms } from '../utils/api'
import { platformClass, platformIcon } from '../utils/platformTag'
import { useEnabled } from '../composables/useEnabled'
import type { Software } from '../types'

const route = useRoute()
const router = useRouter()
const projects = useProjectStore()
const categories = useCategoryStore()
const { resolveProject } = useIconUrl()
const { isProjectEnabled, isPageEnabled } = useEnabled()

const cat = computed(() => categories.bySlug(route.params.slug as string))
const pageVisible = computed(() => cat.value && isPageEnabled(cat.value.id))
const list = computed(() =>
  cat.value ? projects.byCategorySlug(cat.value.slug).filter((p) => isProjectEnabled(p.id)) : [],
)

type Tab = 'list' | 'featured' | 'updated' | 'top'
const activeTab = ref<Tab>('list')
type Sort = 'updated' | 'name' | 'stars'
const sortKey = ref<Sort>('updated')

/* 分页：每页 5 个 */
const PAGE_SIZE = 5
const listPage = ref(1)
const updatedPage = ref(1)
const topPage = ref(1)
const currentPage = computed(() => {
  if (activeTab.value === 'list') return listPage.value
  if (activeTab.value === 'updated') return updatedPage.value
  if (activeTab.value === 'top') return topPage.value
  return 1
})
function setPage(n: number) {
  if (activeTab.value === 'list') listPage.value = n
  else if (activeTab.value === 'updated') updatedPage.value = n
  else if (activeTab.value === 'top') topPage.value = n
}
watch(activeTab, () => { /* 由各 tab 的 setter 自行处理 */ })

/* 软件数量 / 平均评分 / 总下载数 / 热门标签  */
const totalCount = computed(() => list.value.length)
const avgRating = computed(() => {
  const rated = list.value.filter((p) => p.stars && p.stars > 0)
  if (rated.length === 0) return 0
  return rated.reduce((s, p) => s + (p.stars ?? 0), 0) / rated.length
})
const totalStars = computed(() => {
  return list.value.reduce((s, p) => s + (p.stars ?? 0), 0)
})
const hotTags = computed(() => {
  const map = new Map<string, number>()
  for (const p of list.value) {
    if (p.categorySlug) {
      const c = categories.categories.find((x) => x.slug === p.categorySlug)
      if (c) map.set(c.name, (map.get(c.name) || 0) + 1)
    }
  }
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8)
})

/* 标签页过滤 */
const featured = computed(() => list.value.filter((p) => p.featured))
const recentlyUpdated = computed(() => {
  return [...list.value]
    .filter((p) => p.latestUpdateTime)
    .sort((a, b) => new Date(b.latestUpdateTime).getTime() - new Date(a.latestUpdateTime).getTime())
})
const topRanked = computed(() => {
  return [...list.value]
    .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))
    .slice(0, 10)
})

/* 列表排序 */
const sorted = computed(() => {
  const arr = [...list.value]
  if (sortKey.value === 'name') arr.sort((a, b) => a.name.localeCompare(b.name))
  else if (sortKey.value === 'stars') arr.sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))
  else arr.sort((a, b) => new Date(b.latestUpdateTime).getTime() - new Date(a.latestUpdateTime).getTime())
  return arr
})

/* 分页后的列表 */
const pagedSorted = computed(() => {
  const start = (listPage.value - 1) * PAGE_SIZE
  return sorted.value.slice(start, start + PAGE_SIZE)
})
const pagedUpdated = computed(() => {
  const start = (updatedPage.value - 1) * PAGE_SIZE
  return recentlyUpdated.value.slice(start, start + PAGE_SIZE)
})
const pagedTopRanked = computed(() => {
  const start = (topPage.value - 1) * PAGE_SIZE
  return topRanked.value.slice(start, start + PAGE_SIZE)
})

/* 总页数 */
const totalListPages = computed(() => Math.max(1, Math.ceil(sorted.value.length / PAGE_SIZE)))
const totalUpdatedPages = computed(() => Math.max(1, Math.ceil(recentlyUpdated.value.length / PAGE_SIZE)))
const totalTopPages = computed(() => Math.max(1, Math.ceil(topRanked.value.length / PAGE_SIZE)))
const currentTotalPages = computed(() => {
  if (activeTab.value === 'list') return totalListPages.value
  if (activeTab.value === 'updated') return totalUpdatedPages.value
  if (activeTab.value === 'top') return totalTopPages.value
  return 1
})

watch(activeTab, () => {
  listPage.value = 1
  updatedPage.value = 1
  topPage.value = 1
})
watch(sortKey, () => { listPage.value = 1 })

/* 翻页工具：当前页码周围显示哪些页 */
const visiblePages = computed(() => {
  const total = currentTotalPages.value
  const cur = currentPage.value
  const pages: number[] = []
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= cur - 1 && i <= cur + 1)) pages.push(i)
  }
  return pages
})
function goPage(n: number) {
  if (n < 1 || n > currentTotalPages.value) return
  setPage(n)
  document.querySelector('.cat-main')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/* 软件最新版本号文本 */
function latestVersionText(s: Software): string {
  if (!s.latestVersionId) return ''
  return getVersionById(s.latestVersionId)?.version || ''
}

/* 软件真实支持的平台（最多 6 个，避免行式布局太挤） */
function platformsOf(s: Software, max = 6): string[] {
  return getSoftwarePlatforms(s.id).slice(0, max)
}
function platformsMore(s: Software, max = 6): number {
  return Math.max(0, getSoftwarePlatforms(s.id).length - max)
}

const tabs: { key: Tab; label: string; icon: string }[] = [
  { key: 'list', label: '软件列表', icon: '📋' },
  { key: 'updated', label: '最新更新', icon: '🆕' },
  { key: 'top', label: '排行榜', icon: '🏆' },
]
</script>

<template>
  <AmbientOrbs />
  <div class="cat-page">
    <router-link to="/" class="back-link">← 返回</router-link>

    <!-- 分类头部 -->
    <div v-if="cat" class="cat-hero">
      <div class="hero-info">
        <div class="cat-avatar">
          <span>{{ cat.icon || '📦' }}</span>
        </div>
        <div class="cat-meta">
          <h1 class="cat-name">{{ cat.name }}</h1>
          <span class="cat-software-count">共 {{ totalCount }} 个软件</span>
          <p v-if="cat.description" class="cat-desc">{{ cat.description }}</p>
          <p v-else class="cat-desc">发现优质的{{ cat.name }}工具，享受沉浸式{{ cat.name }}体验</p>
        </div>
      </div>
      <div class="hero-decoration" aria-hidden="true">
        <div class="deco-blob deco-blob-1"></div>
        <div class="deco-blob deco-blob-2"></div>
      </div>
    </div>

    <div v-if="!cat" class="not-found">页面未找到</div>
    <div v-else-if="!pageVisible" class="not-found">
      <div class="not-found-icon">🚫</div>
      <p>该页面已下架</p>
    </div>

    <template v-else>
      <!-- Tab 导航 -->
      <div class="tab-bar">
        <button
          v-for="t in tabs"
          :key="t.key"
          :class="['tab-btn', { active: activeTab === t.key }]"
          @click="activeTab = t.key"
        >
          <span class="tab-icon">{{ t.icon }}</span>
          <span>{{ t.label }}</span>
        </button>
      </div>

      <!-- 主体两栏 -->
      <div class="cat-body">
        <div class="cat-main">
          <!-- 列表 -->
          <div v-if="activeTab === 'list'" class="panel">
            <div class="panel-head">
              <h3 class="panel-title">软件列表</h3>
              <label class="sort-control">
                排序:
                <select v-model="sortKey" class="sort-select">
                  <option value="updated">最近更新</option>
                  <option value="name">名称</option>
                  <option value="stars">Star 数</option>
                </select>
              </label>
            </div>
            <div v-if="sorted.length === 0" class="empty-state">该分类下暂无软件</div>
            <div v-else class="cat-list">
              <router-link
                v-for="p in pagedSorted"
                :key="p.id"
                :to="`/software/${p.slug}`"
                class="cat-row"
              >
                <div class="cat-row-icon">
                  <img v-if="p.logo" :src="resolveProject(p)" :alt="p.name" />
                  <span v-else>{{ p.name[0] }}</span>
                </div>
                <div class="cat-row-main">
                  <div class="cat-row-head">
                    <span class="cat-row-name">{{ p.name }}</span>
                    <span v-if="p.featured" class="cat-row-badge">推荐</span>
                    <span v-if="p.stars" class="cat-row-stars">⭐ {{ p.stars.toFixed(1) }}</span>
                  </div>
                  <div v-if="platformsOf(p).length" class="cat-row-platline">
                    <span
                      v-for="pl in platformsOf(p)"
                      :key="pl"
                      :class="['plat-tag', platformClass(pl)]"
                      :title="`支持 ${pl}`"
                    >
                      <span>{{ platformIcon(pl) }}</span>{{ pl }}
                    </span>
                    <span v-if="platformsMore(p) > 0" class="plat-more">+{{ platformsMore(p) }}</span>
                  </div>
                  <div class="cat-row-desc">{{ p.description }}</div>
                </div>
                <div class="cat-row-side">
                  <div v-if="latestVersionText(p)" class="cat-row-version">{{ latestVersionText(p) }}</div>
                  <div v-if="p.latestUpdateTime" class="cat-row-date">{{ fmtDate(p.latestUpdateTime) }} 更新</div>
                </div>
              </router-link>
              <div v-if="totalListPages > 1" class="pagination">
                <span class="page-info">共 {{ totalListPages }} 页</span>
                <div class="page-btns">
                  <button class="page-btn" :disabled="listPage === 1" @click="goPage(listPage - 1)">‹</button>
                  <template v-for="(n, idx) in visiblePages" :key="n + '-' + idx">
                    <span
                      v-if="idx > 0 && visiblePages[idx - 1] !== n - 1"
                      class="page-ellipsis"
                    >…</span>
                    <button
                      :class="['page-btn', { active: listPage === n }]"
                      @click="goPage(n)"
                    >{{ n }}</button>
                  </template>
                  <button class="page-btn" :disabled="listPage === totalListPages" @click="goPage(listPage + 1)">›</button>
                </div>
              </div>
            </div>
          </div>

          <!-- 最新更新 -->
          <div v-else-if="activeTab === 'updated'" class="panel">
            <h3 class="panel-title">🆕 最新更新</h3>
            <div v-if="recentlyUpdated.length === 0" class="empty-state">暂无更新</div>
            <div v-else class="cat-list">
              <router-link
                v-for="p in pagedUpdated"
                :key="p.id"
                :to="`/software/${p.slug}`"
                class="cat-row"
              >
                <div class="cat-row-icon">
                  <img v-if="p.logo" :src="resolveProject(p)" :alt="p.name" />
                  <span v-else>{{ p.name[0] }}</span>
                </div>
                <div class="cat-row-main">
                  <div class="cat-row-head">
                    <span class="cat-row-name">{{ p.name }}</span>
                    <span v-if="p.stars" class="cat-row-stars">⭐ {{ p.stars.toFixed(1) }}</span>
                  </div>
                  <div v-if="platformsOf(p).length" class="cat-row-platline">
                    <span
                      v-for="pl in platformsOf(p)"
                      :key="pl"
                      :class="['plat-tag', platformClass(pl)]"
                      :title="`支持 ${pl}`"
                    >
                      <span>{{ platformIcon(pl) }}</span>{{ pl }}
                    </span>
                    <span v-if="platformsMore(p) > 0" class="plat-more">+{{ platformsMore(p) }}</span>
                  </div>
                  <div class="cat-row-desc">{{ p.description }}</div>
                </div>
                <div class="cat-row-side">
                  <div v-if="latestVersionText(p)" class="cat-row-version">{{ latestVersionText(p) }}</div>
                  <div v-if="p.latestUpdateTime" class="cat-row-date">{{ fmtDate(p.latestUpdateTime) }} 更新</div>
                </div>
              </router-link>
              <div v-if="totalUpdatedPages > 1" class="pagination">
                <span class="page-info">共 {{ totalUpdatedPages }} 页</span>
                <div class="page-btns">
                  <button class="page-btn" :disabled="updatedPage === 1" @click="goPage(updatedPage - 1)">‹</button>
                  <template v-for="(n, idx) in visiblePages" :key="n + '-' + idx">
                    <span
                      v-if="idx > 0 && visiblePages[idx - 1] !== n - 1"
                      class="page-ellipsis"
                    >…</span>
                    <button
                      :class="['page-btn', { active: updatedPage === n }]"
                      @click="goPage(n)"
                    >{{ n }}</button>
                  </template>
                  <button class="page-btn" :disabled="updatedPage === totalUpdatedPages" @click="goPage(updatedPage + 1)">›</button>
                </div>
              </div>
            </div>
          </div>

          <!-- 排行榜 -->
          <div v-else class="panel">
            <h3 class="panel-title">🏆 排行榜</h3>
            <div v-if="topRanked.length === 0" class="empty-state">暂无数据</div>
            <div v-else class="cat-list">
              <router-link
                v-for="(p, i) in pagedTopRanked"
                :key="p.id"
                :to="`/software/${p.slug}`"
                class="cat-row"
              >
                <span :class="['rank-num', { 'rank-top': i < 3 }]">{{ (topPage - 1) * PAGE_SIZE + i + 1 }}</span>
                <div class="cat-row-icon">
                  <img v-if="p.logo" :src="resolveProject(p)" :alt="p.name" />
                  <span v-else>{{ p.name[0] }}</span>
                </div>
                <div class="cat-row-main">
                  <div class="cat-row-head">
                    <span class="cat-row-name">{{ p.name }}</span>
                    <span v-if="p.stars" class="cat-row-stars">⭐ {{ p.stars.toFixed(1) }}</span>
                  </div>
                  <div v-if="platformsOf(p).length" class="cat-row-platline">
                    <span
                      v-for="pl in platformsOf(p)"
                      :key="pl"
                      :class="['plat-tag', platformClass(pl)]"
                      :title="`支持 ${pl}`"
                    >
                      <span>{{ platformIcon(pl) }}</span>{{ pl }}
                    </span>
                    <span v-if="platformsMore(p) > 0" class="plat-more">+{{ platformsMore(p) }}</span>
                  </div>
                  <div class="cat-row-desc">{{ p.description }}</div>
                </div>
                <div class="cat-row-side">
                  <div v-if="latestVersionText(p)" class="cat-row-version">{{ latestVersionText(p) }}</div>
                  <div v-if="p.latestUpdateTime" class="cat-row-date">{{ fmtDate(p.latestUpdateTime) }} 更新</div>
                </div>
              </router-link>
              <div v-if="totalTopPages > 1" class="pagination">
                <span class="page-info">共 {{ totalTopPages }} 页</span>
                <div class="page-btns">
                  <button class="page-btn" :disabled="topPage === 1" @click="goPage(topPage - 1)">‹</button>
                  <template v-for="(n, idx) in visiblePages" :key="n + '-' + idx">
                    <span
                      v-if="idx > 0 && visiblePages[idx - 1] !== n - 1"
                      class="page-ellipsis"
                    >…</span>
                    <button
                      :class="['page-btn', { active: topPage === n }]"
                      @click="goPage(n)"
                    >{{ n }}</button>
                  </template>
                  <button class="page-btn" :disabled="topPage === totalTopPages" @click="goPage(topPage + 1)">›</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 右侧边栏 -->
        <aside class="cat-aside">
          <div class="aside-block">
            <h4 class="aside-title">分类信息</h4>
            <div class="stat-grid">
              <div class="stat-tile stat-tile-blue">
                <div class="stat-value">{{ totalCount }}</div>
                <div class="stat-label">软件数量</div>
              </div>
              <div class="stat-tile stat-tile-pink">
                <div class="stat-value">{{ avgRating ? avgRating.toFixed(1) : '—' }}</div>
                <div class="stat-label">平均 Star</div>
              </div>
              <div class="stat-tile stat-tile-purple">
                <div class="stat-value">{{ Math.floor(totalStars / 1000) }}k+</div>
                <div class="stat-label">总 Star 数</div>
              </div>
              <div class="stat-tile stat-tile-green">
                <div class="stat-value">{{ list.length > 0 ? '98%' : '—' }}</div>
                <div class="stat-label">好评率</div>
              </div>
            </div>
          </div>

          <div v-if="recentlyUpdated.length > 0" class="aside-block">
            <div class="aside-head">
              <h4 class="aside-title">最近更新</h4>
              <a class="section-more">查看全部 ›</a>
            </div>
            <div class="aside-list">
              <router-link
                v-for="p in recentlyUpdated.slice(0, 4)"
                :key="p.id"
                :to="`/software/${p.slug}`"
                class="aside-item"
              >
                <div class="row-icon row-icon-sm">
                  <img v-if="p.logo" :src="resolveProject(p)" :alt="p.name" />
                  <span v-else>{{ p.name[0] }}</span>
                </div>
                <div class="aside-info">
                  <div class="aside-name">{{ p.name }}</div>
                  <div v-if="platformsOf(p, 3).length" class="aside-plats">
                    <span
                      v-for="pl in platformsOf(p, 3)"
                      :key="pl"
                      :class="['plat-tag', platformClass(pl)]"
                      :title="`支持 ${pl}`"
                    >
                      <span>{{ platformIcon(pl) }}</span>{{ pl }}
                    </span>
                    <span v-if="platformsMore(p, 3) > 0" class="plat-more">+{{ platformsMore(p, 3) }}</span>
                  </div>
                  <div class="aside-version">{{ latestVersionText(p) }} · {{ fmtDate(p.latestUpdateTime) }}</div>
                </div>
              </router-link>
            </div>
          </div>
        </aside>
      </div>
    </template>
  </div>
</template>

<style scoped>
.cat-page {
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

/* === 分类 Hero === */
.cat-hero {
  position: relative;
  padding: 32px;
  background: var(--gradient-hero-soft);
  border-radius: var(--radius-2xl);
  overflow: hidden;
  display: flex;
  align-items: center;
  box-shadow: var(--shadow-md);
  margin-bottom: 24px;
}
.hero-info {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 24px;
  width: 100%;
}
.cat-avatar {
  width: 80px;
  height: 80px;
  border-radius: var(--radius-xl);
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.4rem;
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  flex-shrink: 0;
}
.cat-meta { flex: 1; }
.cat-name {
  font-size: clamp(1.5rem, 2vw + 0.8rem, 2rem);
  font-weight: 700;
  color: var(--text-main);
  margin: 0 0 4px;
  display: inline-block;
  margin-right: 12px;
}
.cat-software-count {
  display: inline-flex;
  align-items: center;
  height: 26px;
  padding: 0 12px;
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.7);
  color: var(--color-primary);
  font-size: 0.8rem;
  font-weight: 600;
  vertical-align: middle;
}
.cat-desc {
  font-size: 0.95rem;
  color: var(--text-sec);
  margin: 6px 0 0;
  line-height: 1.5;
}
.hero-decoration {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.deco-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(40px);
  opacity: 0.6;
}
.deco-blob-1 {
  width: 220px;
  height: 220px;
  top: -80px;
  right: -40px;
  background: radial-gradient(circle, rgba(140, 108, 255, 0.5) 0%, transparent 70%);
}
.deco-blob-2 {
  width: 180px;
  height: 180px;
  bottom: -60px;
  right: 100px;
  background: radial-gradient(circle, rgba(52, 120, 246, 0.45) 0%, transparent 70%);
}

/* === Tab === */
.tab-bar {
  display: flex;
  gap: 4px;
  background: var(--color-card);
  padding: 6px;
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-xs);
  border: 1px solid var(--border-soft);
  margin-bottom: 20px;
  width: fit-content;
  max-width: 100%;
  overflow-x: auto;
}
.tab-btn {
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
.tab-btn:hover { color: var(--text-main); }
.tab-btn.active {
  background: var(--gradient-primary);
  color: white;
  font-weight: 600;
  box-shadow: var(--shadow-primary);
}
.tab-icon { font-size: 0.9em; }

/* === 两栏 === */
.cat-body {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 20px;
}

.cat-main { min-width: 0; }
.cat-aside { min-width: 0; }

.panel {
  background: var(--color-card);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  padding: 20px;
  box-shadow: var(--shadow-sm);
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.panel-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
}
.sort-control {
  font-size: 0.85rem;
  color: var(--text-sec);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.sort-select {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 4px 8px;
  background: var(--color-card);
  font-size: 0.85rem;
  color: var(--text-main);
  cursor: pointer;
  outline: none;
}
.sort-select:focus { border-color: var(--color-primary); }

.empty-state {
  text-align: center;
  color: var(--text-tertiary);
  padding: 40px 0;
  font-size: 0.9rem;
}

.cat-card-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* === 软件列表（横向条目） === */
.cat-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.cat-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: var(--color-card);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  text-decoration: none;
  color: inherit;
  box-shadow: var(--shadow-xs);
  transition: transform 0.18s, box-shadow 0.18s, border-color 0.18s;
}
.cat-row:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
  border-color: var(--color-primary);
}
.cat-row-icon {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-md);
  background: var(--gradient-primary-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary);
  font-weight: 700;
  font-size: 1.4rem;
  flex-shrink: 0;
  overflow: hidden;
}
.cat-row .rank-num {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--color-card-soft);
  color: var(--text-tertiary);
  font-size: 0.85rem;
  font-weight: 700;
  flex-shrink: 0;
}
.cat-row .rank-num.rank-top {
  background: var(--gradient-primary);
  color: white;
}
.cat-row-icon img { width: 100%; height: 100%; object-fit: cover; }
.cat-row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cat-row-platline {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  align-items: center;
  min-height: 20px;
}
.cat-row-platline .plat-more {
  height: 20px;
  padding: 0 5px;
  font-size: 0.65rem;
  background: var(--color-card-soft);
  color: var(--text-tertiary);
  border: 1px dashed var(--border-soft);
}
.cat-row-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.cat-row-name {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-main);
}
.cat-row-badge {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 8px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, #FFB347 0%, #FF8C42 100%);
  color: white;
  font-size: 0.7rem;
  font-weight: 600;
}
.cat-row-version {
  font-size: 0.78rem;
  color: var(--color-primary);
  font-weight: 500;
  font-family: var(--font-mono);
  background: var(--color-primary-soft);
  padding: 1px 8px;
  border-radius: var(--radius-full);
}
.cat-row-desc {
  font-size: 0.85rem;
  color: var(--text-sec);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}
.cat-row-meta {
  display: none;
}
.cat-row-stars {
  color: #F5A623;
  font-weight: 600;
  font-size: 0.85rem;
}
.cat-row-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
}
.cat-row-version {
  font-size: 0.85rem;
  color: var(--color-primary);
  font-weight: 600;
  font-family: var(--font-mono);
}
.cat-row-date {
  font-size: 0.78rem;
  color: var(--text-tertiary);
  white-space: nowrap;
  font-family: var(--font-mono);
}
@media (max-width: 640px) {
  .cat-row { padding: 12px; gap: 12px; }
  .cat-row-icon { width: 44px; height: 44px; font-size: 1.1rem; }
  .cat-row-name { font-size: 0.92rem; }
  .cat-row-desc { font-size: 0.8rem; -webkit-line-clamp: 2; }
  .cat-row-side { flex-shrink: 1; min-width: 0; max-width: 120px; overflow: hidden; }
  .cat-row-version {
    max-width: 100%;
    align-self: flex-start;
    font-size: 0.78rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cat-row-date { font-size: 0.72rem; }
}
@media (max-width: 480px) {
  /* 手机模式：平台标签与 ProjectCard 热门卡片同尺寸，一行至少 3 个 */
  .cat-row-platline { gap: 2px; min-height: 10px; }
  .cat-row-platline .plat-tag {
    height: 10px;
    padding: 0 2px;
    border-radius: 2px;
    font-size: 0.33rem;
    gap: 1px;
  }
  .cat-row-platline .plat-more {
    height: 10px;
    padding: 0 2px;
    font-size: 0.33rem;
  }
  .aside-plats { gap: 2px; min-height: 10px; }
  .aside-plats .plat-tag {
    height: 10px;
    padding: 0 2px;
    border-radius: 2px;
    font-size: 0.33rem;
    gap: 1px;
  }
  .aside-plats .plat-more {
    height: 10px;
    padding: 0 2px;
    font-size: 0.33rem;
  }
}

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
.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.page-ellipsis {
  min-width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 0.9rem;
  cursor: default;
}

/* === 排行榜 === */
.rank-list { display: flex; flex-direction: column; gap: 4px; }
.rank-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 8px;
  border-radius: var(--radius-md);
  text-decoration: none;
  color: var(--text-main);
  transition: background 0.18s;
}
.rank-row:hover { background: var(--color-card-soft); }
.rank-num {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--color-card-soft);
  color: var(--text-tertiary);
  font-size: 0.78rem;
  font-weight: 700;
  flex-shrink: 0;
}
.rank-num.rank-top {
  background: var(--gradient-primary);
  color: white;
}
.row-icon {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  background: var(--gradient-primary-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary);
  font-weight: 700;
  font-size: 0.95rem;
  flex-shrink: 0;
  overflow: hidden;
}
.row-icon img { width: 100%; height: 100%; object-fit: cover; }
.row-icon-sm { width: 32px; height: 32px; font-size: 0.85rem; }
.row-info { flex: 1; min-width: 0; }
.row-name {
  font-size: 0.92rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row-version {
  font-size: 0.75rem;
  color: var(--color-primary);
  font-family: var(--font-mono);
}
.row-meta {
  font-size: 0.78rem;
  color: var(--text-tertiary);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row-date {
  font-size: 0.78rem;
  color: var(--text-tertiary);
  white-space: nowrap;
  font-family: var(--font-mono);
}

/* === 侧边栏 === */
.cat-aside {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.aside-block {
  background: var(--color-card);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  padding: 18px;
  box-shadow: var(--shadow-sm);
}
.aside-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12px;
}
.aside-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0 0 12px;
}
.aside-head .aside-title { margin: 0; }
.section-more {
  font-size: 0.78rem;
  color: var(--text-tertiary);
  text-decoration: none;
  cursor: pointer;
  transition: color 0.18s;
}
.section-more:hover { color: var(--color-primary); }

.stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.stat-tile {
  padding: 14px 10px;
  border-radius: var(--radius-md);
  text-align: center;
}
.stat-tile-blue { background: linear-gradient(135deg, rgba(52, 120, 246, 0.1) 0%, rgba(52, 120, 246, 0.04) 100%); }
.stat-tile-pink { background: linear-gradient(135deg, rgba(255, 107, 107, 0.1) 0%, rgba(255, 107, 107, 0.04) 100%); }
.stat-tile-purple { background: linear-gradient(135deg, rgba(140, 108, 255, 0.1) 0%, rgba(140, 108, 255, 0.04) 100%); }
.stat-tile-green { background: linear-gradient(135deg, rgba(60, 179, 113, 0.1) 0%, rgba(60, 179, 113, 0.04) 100%); }
.stat-value {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--text-main);
  line-height: 1.2;
}
.stat-tile-blue .stat-value { color: #2563EB; }
.stat-tile-pink .stat-value { color: #E55353; }
.stat-tile-purple .stat-value { color: #6D4FD6; }
.stat-tile-green .stat-value { color: #2A8C56; }
.stat-label {
  font-size: 0.72rem;
  color: var(--text-tertiary);
  margin-top: 2px;
}

.tag-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.cloud-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 4px 10px;
  border-radius: var(--radius-full);
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: 0.78rem;
  cursor: pointer;
  transition: background 0.18s;
}
.cloud-tag:hover { background: rgba(52, 120, 246, 0.16); }
.cloud-tag em {
  font-style: normal;
  background: rgba(255, 255, 255, 0.5);
  padding: 0 5px;
  border-radius: var(--radius-full);
  font-size: 0.72rem;
}

.aside-list { display: flex; flex-direction: column; gap: 4px; }
.aside-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 6px;
  border-radius: var(--radius-md);
  text-decoration: none;
  color: inherit;
  transition: background 0.18s;
}
.aside-item:hover { background: var(--color-card-soft); }
.aside-info { flex: 1; min-width: 0; }
.aside-name {
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.aside-plats {
  display: flex;
  gap: 3px;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 2px;
  min-height: 16px;
}
.aside-plats .plat-more {
  height: 16px;
  padding: 0 4px;
  font-size: 0.58rem;
  background: var(--color-card-soft);
  color: var(--text-tertiary);
  border: 1px dashed var(--border-soft);
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
}
.aside-version {
  font-size: 0.72rem;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
}

.not-found {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-tertiary);
  font-size: 1rem;
}

/* === 响应式 === */
@media (max-width: 1024px) {
  .cat-body { grid-template-columns: 1fr; }
  .cat-aside { flex-direction: row; flex-wrap: wrap; }
  .aside-block { flex: 1 1 240px; }
}
@media (max-width: 768px) {
  .cat-hero { padding: 20px; }
  .hero-info { flex-direction: column; align-items: flex-start; gap: 12px; }
  .cat-avatar { width: 64px; height: 64px; font-size: 2rem; }
  .cat-name { font-size: 1.4rem; }
  .tab-bar { width: 100%; }
  .tab-btn { flex: 1; justify-content: center; padding: 0 12px; }
  .pagination { justify-content: flex-start; }
  .page-btns { display: flex; align-items: center; gap: 6px; flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; }
  .page-btn { min-width: 28px; height: 28px; font-size: 0.78rem; padding: 0 6px; }
}
</style>
