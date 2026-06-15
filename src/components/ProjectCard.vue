<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import type { Software } from '../types'
import { fmtCompact } from '../utils'
import { useIconUrl } from '../composables/useIconUrl'
import { getSoftwarePlatforms, realDownloads } from '../utils/api'
import { platformClass, platformIcon } from '../utils/platformTag'

const props = defineProps<{ software: Software; compact?: boolean; hideDownloads?: boolean }>()

const { resolveProject } = useIconUrl()
const logoUrl = computed(() => resolveProject(props.software))

const realDL = ref<number | null>(null)
const platforms = ref<string[]>([])

onMounted(() => {
  realDL.value = realDownloads(props.software)
  platforms.value = getSoftwarePlatforms(props.software.id)
})
</script>

<template>
  <router-link :to="`/software/${software.slug}`" class="card">
    <div class="icon">
      <img v-if="logoUrl" :src="logoUrl" :alt="software.name" />
      <span v-else>{{ software.name[0] }}</span>
    </div>
    <h3 class="title">{{ software.name }}</h3>
    <p class="desc">{{ software.description || '暂无描述' }}</p>
    <div :class="['stats', { 'stats-solo': hideDownloads || realDL == null }]">
      <span v-if="software.stars !== undefined" class="stat stat-star" :title="`Star ${software.stars}`">
        <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
          <path fill="currentColor" d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
        </svg>
        {{ fmtCompact(software.stars ?? 0) }}
      </span>
      <span v-if="!hideDownloads && realDL != null" class="stat" :title="`真实下载量 ${realDL}（GitHub）`">
        <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
          <path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7M5 18v2h14v-2H5z"/>
        </svg>
        {{ fmtCompact(realDL) }}
      </span>
    </div>
    <div v-if="platforms.length > 0" class="plat-row">
      <span
        v-for="pl in platforms"
        :key="pl"
        :class="['plat-tag', platformClass(pl)]"
        :title="`支持 ${pl}`"
      >
        <span>{{ platformIcon(pl) }}</span>
        {{ pl }}
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
  -webkit-line-clamp: 2;
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
.stats-solo { gap: 0; }
.stats-solo .stat-star { font-size: 0.92rem; font-weight: 700; color: #F5A623; }
.stats-solo .stat-star svg { width: 14px; height: 14px; }
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

/* === 平台标签（基础样式 + 色板在 src/style.css 全局） === */
.plat-row {
  display: flex;
  gap: 3px;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 2px;
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
  .stats { gap: 6px; font-size: 0.72rem; }
  .dl-btn { height: 28px; font-size: 0.78rem; }
}
@media (max-width: 480px) {
  .card { padding: 10px 6px 8px; gap: 4px; }
  .icon { width: 36px; height: 36px; font-size: 16px; }
  .title { font-size: 0.78rem; }
  .desc { font-size: 0.68rem; -webkit-line-clamp: 1; }
  .stats { gap: 6px; font-size: 0.68rem; }
  .stats svg { width: 10px; height: 10px; }
  /* 手机模式：标签更紧凑，一行至少 3 个 */
  .plat-row { margin-top: 1px; gap: 2px; }
  .plat-tag {
    height: 10px;
    padding: 0 2px;
    border-radius: 2px;
    font-size: 0.33rem;
    gap: 1px;
  }
  .dl-btn { height: 24px; font-size: 0.72rem; }
}
</style>
