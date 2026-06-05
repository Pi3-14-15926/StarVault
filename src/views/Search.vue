<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProjectStore } from '../store/project'
import { useCategoryStore } from '../store/category'
import ProjectCard from '../components/ProjectCard.vue'
import AmbientOrbs from '../components/AmbientOrbs.vue'

const route = useRoute()
const router = useRouter()
const projects = useProjectStore()
const categories = useCategoryStore()

const keyword = ref((route.query.q as string) || '')
const categoryFilter = ref<string>('')
const sortKey = ref<'updated' | 'name' | 'stars'>('updated')

const results = computed(() => {
  let list = [...projects.projects]
  const kw = keyword.value.trim().toLowerCase()
  if (kw) {
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(kw) ||
        p.description.toLowerCase().includes(kw),
    )
  }
  if (categoryFilter.value) {
    list = list.filter((p) => p.categoryId === categoryFilter.value)
  }
  if (sortKey.value === 'name') list.sort((a, b) => a.name.localeCompare(b.name))
  else if (sortKey.value === 'stars') list.sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))
  else list.sort((a, b) => new Date(b.latestUpdateTime).getTime() - new Date(a.latestUpdateTime).getTime())
  return list
})

watch(
  () => route.query.q,
  (q) => { keyword.value = (q as string) || '' },
)

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
      <input
        v-model="keyword"
        placeholder="输入软件名称或描述..."
        class="search-input"
        @keyup.enter="doSearch"
      />
      <button class="btn-primary" @click="doSearch">搜索</button>
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
      <ProjectCard v-for="p in results" :key="p.id" :project="p" />
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
  gap: 10px;
  max-width: 640px;
  margin: 0 auto 16px;
}
.search-input {
  flex: 1;
  height: 44px;
  padding: 0 18px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  background: var(--color-card);
  font-size: 0.95rem;
  color: var(--text-main);
  outline: none;
  box-shadow: var(--shadow-xs);
  transition: border-color 0.18s, box-shadow 0.18s;
}
.search-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-soft);
}
.search-input::placeholder { color: var(--text-tertiary); }

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

.not-found {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-tertiary);
}
.not-found-icon { font-size: 3rem; margin-bottom: 12px; }
.not-found p { margin: 0; font-size: 0.95rem; }

@media (max-width: 768px) {
  .filter-bar { flex-wrap: wrap; padding: 10px 12px; }
  .filter-right { width: 100%; }
  .result-grid { grid-template-columns: 1fr; }
}
@media (max-width: 480px) {
  .search-bar { flex-direction: column; }
  .search-bar .btn-primary { width: 100%; }
}
</style>
