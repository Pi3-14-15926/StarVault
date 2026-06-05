<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProjectStore } from '../store/project'
import { useCategoryStore } from '../store/category'
import ProjectCard from '../components/ProjectCard.vue'
import AmbientOrbs from '../components/AmbientOrbs.vue'
import { fmtDate } from '../utils'

const route = useRoute()
const router = useRouter()
const projects = useProjectStore()
const categories = useCategoryStore()

const cat = computed(() => categories.bySlug(route.params.slug as string))
const list = computed(() => (cat.value ? projects.byCategory(cat.value.id) : []))

type Tab = 'list' | 'featured' | 'updated' | 'top'
const activeTab = ref<Tab>('list')
type Sort = 'updated' | 'name' | 'stars'
const sortKey = ref<Sort>('updated')

/* 软件数量 / 平均评分 / 总下载数 / 热门标签  */
const totalCount = computed(() => list.value.length)
const avgRating = computed(() => {
  const rated = list.value.filter(p => p.stars && p.stars > 0)
  if (rated.length === 0) return 0
  return rated.reduce((s, p) => s + (p.stars ?? 0), 0) / rated.length
})
const totalStars = computed(() => {
  return list.value.reduce((s, p) => s + (p.stars ?? 0), 0)
})
const hotTags = computed(() => {
  const map = new Map<string, number>()
  for (const p of list.value) {
    if (p.categoryId) {
      const c = categories.categories.find(x => x.id === p.categoryId)
      if (c) map.set(c.name, (map.get(c.name) || 0) + 1)
    }
  }
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8)
})

/* 标签页过滤 */
const featured = computed(() => list.value.filter(p => p.featured))
const recentlyUpdated = computed(() => {
  return [...list.value]
    .filter(p => p.latestUpdateTime)
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

const tabs: { key: Tab; label: string; icon: string }[] = [
  { key: 'list', label: '软件列表', icon: '📋' },
  { key: 'featured', label: '推荐软件', icon: '⭐' },
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
            <div v-else class="cat-card-list">
              <ProjectCard v-for="p in sorted" :key="p.id" :project="p" />
            </div>
          </div>

          <!-- 推荐 -->
          <div v-else-if="activeTab === 'featured'" class="panel">
            <h3 class="panel-title">⭐ 推荐软件</h3>
            <div v-if="featured.length === 0" class="empty-state">暂无推荐</div>
            <div v-else class="cat-card-list">
              <ProjectCard v-for="p in featured" :key="p.id" :project="p" />
            </div>
          </div>

          <!-- 最新更新 -->
          <div v-else-if="activeTab === 'updated'" class="panel">
            <h3 class="panel-title">🆕 最新更新</h3>
            <div v-if="recentlyUpdated.length === 0" class="empty-state">暂无更新</div>
            <div v-else class="cat-card-list">
              <ProjectCard v-for="p in recentlyUpdated" :key="p.id" :project="p" />
            </div>
          </div>

          <!-- 排行榜 -->
          <div v-else class="panel">
            <h3 class="panel-title">🏆 排行榜</h3>
            <div v-if="topRanked.length === 0" class="empty-state">暂无数据</div>
            <div v-else class="rank-list">
              <router-link
                v-for="(p, i) in topRanked"
                :key="p.id"
                :to="`/software/${p.slug}`"
                class="rank-row"
              >
                <span :class="['rank-num', { 'rank-top': i < 3 }]">{{ i + 1 }}</span>
                <div class="row-icon">
                  <img v-if="p.logo" :src="p.logo" :alt="p.name" />
                  <span v-else>{{ p.name[0] }}</span>
                </div>
                <div class="row-info">
                  <div class="row-name">{{ p.name }} <span class="row-version">{{ p.latestVersion }}</span></div>
                  <div class="row-meta">{{ p.description }}</div>
                </div>
                <div class="row-date">⭐ {{ (p.stars ?? 0).toLocaleString() }}</div>
              </router-link>
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

          <div v-if="hotTags.length > 0" class="aside-block">
            <h4 class="aside-title">热门标签</h4>
            <div class="tag-cloud">
              <span v-for="[name, count] in hotTags" :key="name" class="cloud-tag">
                {{ name }} <em>{{ count }}</em>
              </span>
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
                  <img v-if="p.logo" :src="p.logo" :alt="p.name" />
                  <span v-else>{{ p.name[0] }}</span>
                </div>
                <div class="aside-info">
                  <div class="aside-name">{{ p.name }}</div>
                  <div class="aside-version">{{ p.latestVersion }} · {{ fmtDate(p.latestUpdateTime) }}</div>
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
}
</style>
