<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Project } from '../types'
import { fmtDate, relTime, fmtCompact } from '../utils'

const props = defineProps<{ project: Project; compact?: boolean }>()
const expanded = ref(false)

function openUrl(url: string) { window.open(url, '_blank') }
</script>

<template>
  <router-link :to="`/software/${project.slug}`" class="card" :class="{ 'card-compact': compact }">
    <!-- 右上角 GitHub 图标 + Star 计数 -->
    <div class="card-meta">
      <a
        v-if="project.githubRepo"
        :href="`https://github.com/${project.githubRepo}`"
        target="_blank"
        rel="noopener noreferrer"
        class="github-icon-btn"
        :title="project.githubRepo"
        @click.stop
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" width="14" height="14">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/>
        </svg>
      </a>
      <span
        v-if="project.stars !== undefined"
        class="meta-badge"
        :title="`Star ${project.stars?.toLocaleString('zh-CN')}`"
      >
        ⭐ {{ fmtCompact(project.stars ?? 0) }}
      </span>
    </div>

    <!-- 卡片头部：图标 + 名称 -->
    <div class="card-header">
      <div class="icon">
        <img v-if="project.logo" :src="project.logo" :alt="project.name" />
        <span v-else>{{ project.name[0] }}</span>
      </div>
      <div class="card-title-wrap">
        <h2 class="card-title">{{ project.name }}</h2>
        <div class="card-subtitle">{{ project.description || '暂无描述' }}</div>
      </div>
    </div>

    <!-- 有版本信息 -->
    <template v-if="project.versions.length > 0">
      <div class="release-info">
        <div class="release-header">
          <span class="release-title">{{ project.versions[0].version }}</span>
          <span class="release-date">
            {{ fmtDate(project.versions[0].publishedAt) }} · {{ relTime(project.versions[0].publishedAt) }}
          </span>
        </div>

        <div v-if="!compact" class="release-notes">{{ project.versions[0].changelog || '该版本未提供更新日志。' }}</div>

        <div class="download-list">
          <template v-if="project.versions[0].downloads.length > 0">
            <a
              v-for="dl in (expanded ? project.versions[0].downloads : project.versions[0].downloads.slice(0, 1))"
              :key="dl.filename"
              :href="dl.url"
              target="_blank"
              rel="noopener noreferrer"
              class="download-btn"
              @click.stop
            >
              <span class="apk-name">{{ dl.filename }}</span>
              <span class="apk-size">{{ dl.size }}</span>
            </a>
            <button
              v-if="project.versions[0].downloads.length > 1"
              class="expand-btn"
              @click.prevent.stop="expanded = !expanded"
            >
              {{ expanded ? '收起' : `+${project.versions[0].downloads.length - 1} 个文件` }}
            </button>
          </template>
          <div v-else class="empty-msg">该版本暂无文件</div>
        </div>
      </div>
    </template>

    <!-- 无版本 -->
    <div v-else class="empty-state">暂无版本信息</div>
  </router-link>
</template>

<style scoped>
.card {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 20px;
  background: var(--color-card);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  text-decoration: none;
  color: inherit;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  animation: riseFade 0.5s ease both;
}
.card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
  border-color: var(--border-color);
}

.card-meta {
  position: absolute;
  top: 14px;
  right: 14px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.github-icon-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--color-card-soft);
  color: var(--text-sec);
  text-decoration: none;
  border: 1px solid var(--border-soft);
  transition: background 0.18s, color 0.18s, transform 0.12s;
}
.github-icon-btn:hover {
  background: var(--color-card);
  color: var(--text-main);
  transform: translateY(-1px);
}
.github-icon-btn svg { fill: currentColor; }

.meta-badge {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 10px;
  border-radius: var(--radius-full);
  background: var(--color-card-soft);
  color: var(--text-sec);
  font-size: 0.75rem;
  font-weight: 600;
  border: 1px solid var(--border-soft);
  white-space: nowrap;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
  padding-right: 80px; /* 给右上角meta留位 */
}
.icon {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--gradient-primary-soft);
  color: var(--color-primary);
  font-weight: 700;
  font-size: 22px;
  flex-shrink: 0;
  border: 1px solid var(--border-soft);
  overflow: hidden;
}
.icon img { width: 100%; height: 100%; object-fit: cover; }
.card-title-wrap { min-width: 0; flex: 1; }
.card-title {
  font-size: 1.05rem;
  font-weight: 700;
  margin: 0;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card-subtitle {
  font-size: 0.78rem;
  color: var(--text-tertiary);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.release-info {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.release-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px;
}
.release-title {
  font-weight: 700;
  font-size: 0.95rem;
  color: var(--text-main);
  background: var(--gradient-primary-soft);
  padding: 2px 10px;
  border-radius: var(--radius-full);
}
.release-date {
  font-size: 0.78rem;
  color: var(--text-tertiary);
}
.release-notes {
  font-size: 0.85rem;
  color: var(--text-sec);
  background: var(--color-card-soft);
  padding: 10px 12px;
  border-radius: var(--radius-md);
  max-height: 110px;
  overflow-y: auto;
  white-space: pre-wrap;
  line-height: 1.5;
  border-left: 3px solid var(--color-primary);
  scrollbar-width: thin;
  word-break: break-word;
}
.release-notes::-webkit-scrollbar { width: 4px; }
.release-notes::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 2px; }

.download-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: auto;
}
.download-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--gradient-primary);
  color: var(--text-on-primary);
  text-decoration: none;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  font-weight: 600;
  transition: transform 0.15s, box-shadow 0.18s;
  font-size: 0.88rem;
  box-shadow: var(--shadow-primary);
}
.download-btn:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-primary-hover);
}
.apk-name {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.apk-size {
  font-size: 0.75rem;
  opacity: 0.9;
  white-space: nowrap;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.22);
  padding: 2px 8px;
  border-radius: var(--radius-full);
}

.expand-btn {
  display: block;
  width: 100%;
  margin-top: 2px;
  padding: 7px;
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-sec);
  font-size: 0.8rem;
  cursor: pointer;
  transition: background 0.18s, color 0.18s;
}
.expand-btn:hover {
  background: var(--color-primary-soft);
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.empty-msg {
  text-align: center;
  color: var(--text-tertiary);
  font-size: 0.85rem;
  padding: 8px;
  background: var(--color-card-soft);
  border-radius: var(--radius-md);
}
.empty-state {
  text-align: center;
  color: var(--text-tertiary);
  font-size: 0.88rem;
  padding: 24px 0;
  background: var(--color-card-soft);
  border-radius: var(--radius-md);
  border: 1px dashed var(--border-color);
}

.card-compact { padding: 16px; }
.card-compact .card-header { padding-right: 60px; }
.card-compact .icon { width: 40px; height: 40px; font-size: 18px; }

@media (max-width: 480px) {
  .card { padding: 16px; }
  .icon { width: 40px; height: 40px; font-size: 18px; }
  .card-title { font-size: 0.95rem; }
  .download-btn { padding: 9px 12px; }
  .apk-name { font-size: 0.8rem; }
}
</style>
