<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProjectStore } from '../store/project'
import { useCategoryStore } from '../store/category'
import ProjectCard from '../components/ProjectCard.vue'
import AmbientOrbs from '../components/AmbientOrbs.vue'
import { useEnabled } from '../composables/useEnabled'

const route = useRoute()
const router = useRouter()
const projects = useProjectStore()
const categories = useCategoryStore()
const { isProjectEnabled, isPageEnabled } = useEnabled()

const keyword = ref((route.query.q as string) || '')
const categoryFilter = ref<string>('')
const sortKey = ref<'updated' | 'name' | 'stars'>('updated')

const results = computed(() => {
  let list = [...projects.software].filter((p) => isProjectEnabled(p.id))
  const kw = keyword.value.trim().toLowerCase()
  if (kw) {
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(kw) ||
        p.description.toLowerCase().includes(kw),
    )
  }
  if (categoryFilter.value) {
    const cat = categories.categories.find((c) => c.id === categoryFilter.value)
    if (cat) {
      if (!isPageEnabled(cat.id)) return []
      list = list.filter((p) => p.categorySlug === cat.slug)
    }
  }
  if (sortKey.value === 'name') list.sort((a, b) => a.name.localeCompare(b.name))
  else if (sortKey.value === 'stars') list.sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))
  else list.sort((a, b) => new Date(b.latestUpdateTime).getTime() - new Date(a.latestUpdateTime).getTime())
  return list
})

/* === 分页（每页 5 个，与分类页保持一致） === */
const PAGE_SIZE = 5
const currentPage = ref(1)
const totalPages = computed(() => Math.max(1, Math.ceil(results.value.length / PAGE_SIZE)))
const pagedResults = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return results.value.slice(start, start + PAGE_SIZE)
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
  document.querySelector('.result-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

watch(
  () => route.query.q,
  (q) => { keyword.value = (q as string) || '' },
)
/* 过滤条件变化时重置到第 1 页 */
watch([keyword, categoryFilter, sortKey], () => { currentPage.value = 1 })

function doSearch() {
  router.replace({ query: { q: keyword.value.trim() || undefined } })
}
</script>

<template>
  <AmbientOrbs />
  <div class="search-page">
    <router-link to="/" class="back-link">← 返回首页</router-link>

    <div class="search-hero">
      <h1 class="search-title">🔍 搜索</h1>
      <p class="search-desc">探索所有软件</p>
    </div>

    <div class="search-bar">
      <svg class="search-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5Zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14Z"/>
      </svg>
      <input
        v-model="keyword"
        placeholder="输入软件名称或描述..."
        class="search-input"
        @keyup.enter="doSearch"
      />
      <button class="search-btn" @click="doSearch">搜索</button>
    </div>

    <div class="filter-bar">
      <div class="filter-pills">
        <button
          :class="['pill', { active: categoryFilter === '' }]"
          @click="categoryFilter = ''"
        >全部</button>
        <button
          v-for="c in categories.categories"
          :key="c.id"
          :class="['pill', { active: categoryFilter === c.id }]"
          @click="categoryFilter = c.id"
        >{{ c.icon }} {{ c.name }}</button>
      </div>
      <div class="filter-right">
        <span class="result-count">共 {{ results.length }} 个结果</span>
        <select v-model="sortKey" class="sort-select">
          <option value="updated">最近更新</option>
          <option value="name">名称</option>
          <option value="stars">Star 数</option>
        </select>
      </div>
    </div>

    <div v-if="results.length" class="result-grid">
      <ProjectCard v-for="p in pagedResults" :key="p.id" :software="p" />
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
    <div v-else class="not-found">
      <div class="not-found-icon">🔍</div>
      <p v-if="keyword.trim()">未找到匹配"{{ keyword }}"的软件</p>
      <p v-else>输入关键词开始搜索</p>
    </div>
  </div>
</template>

<style scoped>
.search-page {
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
  transition: background 0.18s;
}
.back-link:hover { background: var(--color-card-soft); color: var(--text-main); }

.search-hero {
  text-align: center;
  margin-bottom: 24px;
}
.search-title {
  font-size: clamp(1.5rem, 2vw + 0.8rem, 2rem);
  font-weight: 700;
  color: var(--text-main);
  margin: 0 0 4px;
}
.search-desc {
  color: var(--text-tertiary);
  font-size: 0.95rem;
  margin: 0;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 640px;
  margin: 0 auto 20px;
  padding: 6px 6px 6px 16px;
  background: var(--color-card);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-sm);
  transition: border-color 0.18s, box-shadow 0.18s;
}
.search-bar:focus-within {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-soft);
}
.search-icon {
  color: var(--text-tertiary);
  flex-shrink: 0;
}
.search-input {
  flex: 1;
  min-width: 0;
  height: 44px;
  border: none;
  background: transparent;
  font-size: 0.95rem;
  color: var(--text-main);
  outline: none;
}
.search-input::placeholder { color: var(--text-tertiary); }
.search-btn {
  flex-shrink: 0;
  height: 40px;
  padding: 0 22px;
  border: none;
  border-radius: var(--radius-full);
  background: var(--gradient-primary);
  color: white;
  font-size: 0.92rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.18s, opacity 0.18s;
  box-shadow: var(--shadow-primary);
}
.search-btn:hover { transform: translateY(-1px); box-shadow: var(--shadow-primary-hover); }
.search-btn:active { transform: translateY(0); opacity: 0.9; }

.filter-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  max-width: 100%;
  margin: 0 auto 24px;
  background: var(--color-card);
  padding: 12px 16px;
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-xs);
  border: 1px solid var(--border-soft);
  overflow-x: auto;
}
.filter-pills {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.pill {
  padding: 6px 14px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-sec);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.18s, color 0.18s, border-color 0.18s;
}
.pill:hover {
  background: var(--color-card-soft);
  color: var(--text-main);
}
.pill.active {
  background: var(--gradient-primary);
  color: white;
  border-color: transparent;
  font-weight: 600;
}
.filter-right {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
  flex-shrink: 0;
}
.result-count {
  font-size: 0.85rem;
  color: var(--text-tertiary);
  white-space: nowrap;
}
.sort-select {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 5px 10px;
  background: var(--color-card);
  font-size: 0.85rem;
  color: var(--text-main);
  cursor: pointer;
  outline: none;
}
.sort-select:focus { border-color: var(--color-primary); }

.result-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

/* === 分页（与 Category.vue 一致） === */
.pagination {
  grid-column: 1 / -1;
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

.not-found {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-tertiary);
}
.not-found-icon { font-size: 3rem; margin-bottom: 12px; }
.not-found p { margin: 0; font-size: 0.95rem; }

@media (max-width: 768px) {
  .filter-bar { flex-wrap: wrap; padding: 10px 12px; border-radius: var(--radius-lg); }
  .filter-right { width: 100%; }
  .result-grid { grid-template-columns: 1fr; }
  .pagination { justify-content: flex-start; }
  .page-btns { display: flex; align-items: center; gap: 6px; flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; }
  .page-btn { min-width: 28px; height: 28px; font-size: 0.78rem; padding: 0 6px; }
}
@media (max-width: 480px) {
  .search-bar { padding: 5px 5px 5px 14px; gap: 6px; }
  .search-input { height: 42px; font-size: 0.92rem; }
  .search-icon { width: 18px; height: 18px; }
  .search-btn { height: 38px; padding: 0 18px; font-size: 0.88rem; }
}
</style>
