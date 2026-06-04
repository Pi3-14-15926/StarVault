<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProjectStore } from '../store/project'
import { useCategoryStore } from '../store/category'
import ProjectCard from '../components/ProjectCard.vue'
import AmbientOrbs from '../components/AmbientOrbs.vue'

const route = useRoute()
const router = useRouter()
const projects = useProjectStore()
const categories = useCategoryStore()

const cat = computed(() => categories.bySlug(route.params.slug as string))
const list = computed(() =>
  cat.value ? projects.byCategory(cat.value.id) : [],
)

type Sort = 'updated' | 'name' | 'stars'
const sortKey = ref<Sort>('updated')
const sorted = computed(() => {
  const arr = [...list.value]
  if (sortKey.value === 'name') arr.sort((a, b) => a.name.localeCompare(b.name))
  else if (sortKey.value === 'stars') arr.sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))
  else arr.sort((a, b) => new Date(b.latestUpdateTime).getTime() - new Date(a.latestUpdateTime).getTime())
  return arr
})
</script>

<template>
  <AmbientOrbs />
  <div class="container">
    <header>
      <router-link to="/" class="back-link">← 返回首页</router-link>
      <h1>{{ cat ? `${cat.icon} ${cat.name}` : '页面' }}</h1>
      <p v-if="cat?.description" class="page-desc">{{ cat.description }}</p>
      <div class="subtitle">{{ list.length }} 个软件</div>
    </header>

    <div class="controls" v-if="sorted.length > 1">
      <span class="switch-label">
        排序：
        <select v-model="sortKey" class="sort-select">
          <option value="updated">最近更新</option>
          <option value="name">名称</option>
          <option value="stars">Star 数</option>
        </select>
      </span>
    </div>

    <div v-if="!cat" class="not-found">页面未找到</div>

    <div v-else class="card-grid">
      <ProjectCard v-for="p in sorted" :key="p.id" :project="p" />
      <div v-if="sorted.length === 0" class="loading-placeholder" style="grid-column:1/-1">
        该页面下暂无软件
      </div>
    </div>

    <footer></footer>
  </div>
</template>

<style scoped>
.container {
  max-width: 900px; width: 100%; margin: 0 auto; position: relative; z-index: 1;
}
header {
  text-align: center; margin-bottom: 24px; padding: 20px 0 10px; position: relative;
}
h1 {
  font-family: var(--font-display);
  color: var(--text-main); margin: 0 0 6px; font-weight: 700;
  font-size: clamp(1.5rem, 2vw + 0.8rem, 2rem);
}
.page-desc {
  color: var(--text-sec);
  font-size: 0.92rem;
  margin: 4px 0 0;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
}
.subtitle { color: var(--text-sec); font-size: 0.92rem; text-align: center; }
.back-link {
  position: absolute; top: 12px; left: 0;
  font-size: 0.85rem; color: var(--text-sec);
  padding: 4px 10px; border-radius: 999px;
  background: rgba(46, 42, 36, 0.06);
  border: 1px solid var(--border-color); text-decoration: none;
}
.back-link:hover { background: rgba(46, 42, 36, 0.12); }

.controls {
  max-width: 680px; margin: 0 auto 25px; text-align: center;
  background: var(--card-bg); padding: 10px 18px;
  border-radius: 999px; box-shadow: var(--shadow-sm);
  border: 1px solid var(--border-color);
}
.sort-select {
  border: none; background: transparent; font-size: 0.9rem;
  color: var(--text-main); font-weight: 600; cursor: pointer;
  outline: none; font-family: inherit;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
}

.loading-placeholder {
  color: var(--text-sec); font-style: italic; text-align: center;
  padding: 20px 0; background: rgba(255,255,255,0.7);
  border-radius: 14px; border: 1px dashed var(--border-color);
}
.not-found { text-align: center; padding: 40px; color: var(--text-sec); }

footer { text-align: center; margin-top: 50px; color: var(--text-sec); font-size: 0.82rem; padding-bottom: 20px; }

@media (min-width: 900px) {
  .card-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
