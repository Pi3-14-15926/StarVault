<script setup lang="ts">
import { ref } from 'vue'
import type { Project } from '../types'
import { fmtCompact } from '../utils'

const props = defineProps<{ project: Project; compact?: boolean }>()

function totalDownloads(): number {
  return (props.project.versions || []).reduce(
    (s, v) => s + (v.downloads?.length || 0),
    0,
  )
}
</script>

<template>
  <router-link :to="`/software/${project.slug}`" class="card">
    <div class="icon">
      <img v-if="project.logo" :src="project.logo" :alt="project.name" />
      <span v-else>{{ project.name[0] }}</span>
    </div>
    <h3 class="title">{{ project.name }}</h3>
    <p class="desc">{{ project.description || '暂无描述' }}</p>
    <div class="stats">
      <span v-if="project.stars !== undefined" class="stat" :title="`Star ${project.stars}`">
        <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
          <path fill="currentColor" d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
        </svg>
        {{ fmtCompact(project.stars ?? 0) }}
      </span>
      <span class="stat" :title="`下载量 ${totalDownloads()}`">
        <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
          <path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
        </svg>
        {{ fmtCompact(totalDownloads()) }}
      </span>
    </div>
    <span class="dl-btn">下载</span>
  </router-link>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 18px 14px 14px;
  background: var(--color-card);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  text-decoration: none;
  color: inherit;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  gap: 8px;
}
.card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-md);
  border-color: var(--color-primary);
}

.icon {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--gradient-primary-soft);
  color: var(--color-primary);
  font-weight: 700;
  font-size: 24px;
  flex-shrink: 0;
  overflow: hidden;
  border: 1px solid var(--border-soft);
}
.icon img { width: 100%; height: 100%; object-fit: cover; }

.title {
  font-size: 0.95rem;
  font-weight: 700;
  margin: 0;
  line-height: 1.3;
  color: var(--text-main);
  width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.desc {
  font-size: 0.78rem;
  color: var(--text-tertiary);
  margin: 0;
  line-height: 1.4;
  width: 100%;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 1.1em;
}

.stats {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 2px;
  font-size: 0.78rem;
}
.stat {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--text-tertiary);
  font-weight: 500;
}
.stat svg { color: #F5A623; }

.dl-btn {
  margin-top: 4px;
  width: 100%;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border-radius: var(--radius-full);
  background: var(--gradient-primary-soft);
  color: var(--color-primary);
  font-size: 0.82rem;
  font-weight: 600;
  transition: background 0.18s, color 0.18s;
}
.dl-btn::before {
  content: '↓';
  font-weight: 700;
}
.card:hover .dl-btn {
  background: var(--gradient-primary);
  color: var(--text-on-primary);
}

@media (max-width: 768px) {
  .card { padding: 12px 8px 10px; gap: 6px; }
  .icon { width: 40px; height: 40px; font-size: 18px; }
  .title { font-size: 0.85rem; }
  .desc { font-size: 0.72rem; }
  .stats { gap: 8px; font-size: 0.72rem; }
  .dl-btn { height: 28px; font-size: 0.78rem; }
}
@media (max-width: 480px) {
  .card { padding: 10px 6px 8px; gap: 4px; }
  .icon { width: 36px; height: 36px; font-size: 16px; }
  .title { font-size: 0.78rem; }
  .desc { font-size: 0.68rem; -webkit-line-clamp: 1; }
  .stats { gap: 6px; font-size: 0.68rem; }
  .stats svg { width: 10px; height: 10px; }
  .dl-btn { height: 24px; font-size: 0.72rem; }
}
</style>
