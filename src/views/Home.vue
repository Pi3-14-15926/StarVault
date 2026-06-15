<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useProjectStore } from '../store/project'
import { useCategoryStore } from '../store/category'
import { useSettingStore } from '../store/settings'
import { fmtDate, fmtCompact } from '../utils'
import { useIconUrl } from '../composables/useIconUrl'
import { getSoftwareVersions, getVersionDownloads, getVersionById, getSoftwarePlatforms, realDownloads, fmtRealDownloads } from '../utils/api'
import { platformClass, platformIcon } from '../utils/platformTag'
import { useEnabled } from '../composables/useEnabled'
import ProjectCard from '../components/ProjectCard.vue'
import AmbientOrbs from '../components/AmbientOrbs.vue'
import type { Software } from '../types'

const projects = useProjectStore()
const categories = useCategoryStore()
const settings = useSettingStore()
const { resolveProject } = useIconUrl()
const { isProjectEnabled } = useEnabled()

/* 默认推荐（无数据时兜底显示） */
const defaultFeatured: any[] = [
  {
    id: 'default-1',
    name: 'Legado 阅读',
    description: '开源免费 · 跨平台阅读神器',
    longDescription: '支持多种书源，界面简洁，功能强大',
    logo: '',
    iconEmoji: '📖',
    slug: 'legado',
    githubUrl: 'https://github.com/gedoor/legado',
  },
  {
    id: 'default-2',
    name: 'Obsidian 笔记',
    description: '知识管理 · 双向链接笔记工具',
    longDescription: '本地存储 Markdown 文件，构建专属知识网络',
    logo: '',
    iconEmoji: '💎',
    slug: 'obsidian',
    githubUrl: '',
  },
  {
    id: 'default-3',
    name: 'VS Code',
    description: '代码编辑器 · 开发者首选工具',
    longDescription: '免费开源，跨平台支持，插件生态丰富',
    logo: '',
    iconEmoji: '💻',
    slug: 'vscode',
    githubUrl: 'https://github.com/microsoft/vscode',
  },
]

/* 特色项目（featured），用于 Hero 轮播 */
const featured = computed(() => {
  const real = projects.software.filter((p) => p.featured && isProjectEnabled(p.id))
  return real.length > 0 ? real : defaultFeatured
})
const carouselIndex = ref(0)
let timer: number | null = null
function nextSlide() {
  if (featured.value.length === 0) return
  carouselIndex.value = (carouselIndex.value + 1) % featured.value.length
}
function prevSlide() {
  if (featured.value.length === 0) return
  carouselIndex.value = (carouselIndex.value - 1 + featured.value.length) % featured.value.length
}
function goSlide(i: number) { carouselIndex.value = i }
onMounted(() => {
  projects.refresh()
  categories.refresh()
  settings.refresh()
  if (featured.value.length > 1) {
    timer = window.setInterval(nextSlide, 5000)
  }
  updateCatCols()
  window.addEventListener('resize', updateCatCols)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
  window.removeEventListener('resize', updateCatCols)
})

/* 分类卡片分页：每页 2 行，列数随窗口变化 */
const catPage = ref(0)
const catCols = ref(8)
function updateCatCols() {
  const w = window.innerWidth
  if (w < 480) catCols.value = 3
  else if (w < 768) catCols.value = 4
  else if (w < 1024) catCols.value = 6
  else catCols.value = 8
}
const catPageSize = computed(() => catCols.value * 2 - 1) /* 预留 1 个给「更多」卡片，刚好 2 行 */
const catTotalPages = computed(() => Math.max(1, Math.ceil(categories.categories.length / catPageSize.value)))
const catPaginated = computed(() => {
  const start = catPage.value * catPageSize.value
  return categories.categories.slice(start, start + catPageSize.value)
})
function prevCatPage() { if (catPage.value > 0) catPage.value-- }
function nextCatPage() { if (catPage.value < catTotalPages.value - 1) catPage.value++ }

/* 分类下软件数量 */
function projectCountByCategory(cslug: string): number {
  return projects.software.filter((p) => p.categorySlug === cslug).length
}

/* 热门软件（按 Star 排序） */
const hotProjects = computed(() => {
  return [...projects.software]
    .filter((p) => isProjectEnabled(p.id))
    .filter((p) => p.sourceType === 'github' && (p.stars ?? 0) > 0)
    .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))
    .slice(0, 3)
})

/* 最近更新（按 latestUpdateTime 倒序） */
const recentlyUpdated = computed(() => {
  return [...projects.software]
    .filter((p) => isProjectEnabled(p.id))
    .filter((p) => p.latestUpdateTime)
    .sort((a, b) => new Date(b.latestUpdateTime).getTime() - new Date(a.latestUpdateTime).getTime())
    .slice(0, 3)
})

/* 软件真实下载量（仅 GitHub Release 来源有数据，否则 null） */
function realDL(s: Software): number | null {
  return realDownloads(s)
}
/* 下载量排序：缺数据排最后 */
function cmpRealDL(a: Software, b: Software): number {
  const va = realDL(a)
  const vb = realDL(b)
  if (va == null && vb == null) return 0
  if (va == null) return 1
  if (vb == null) return -1
  return vb - va
}

/* 本周下载榜（按 GitHub 真实下载量排序，缺数据排最后） */
const topDownloads = computed(() => {
  return [...projects.software]
    .filter((p) => isProjectEnabled(p.id))
    .sort(cmpRealDL)
    .slice(0, 3)
})

/* === 派生数据映射（避免 v-for 里直接调 expensive 函数） === */
const platformsMap = computed(() => {
  const m = new Map<string, string[]>()
  for (const p of projects.software) m.set(p.id, getSoftwarePlatforms(p.id))
  return m
})
const latestVersionMap = computed(() => {
  const m = new Map<string, string>()
  for (const p of projects.software) {
    m.set(p.id, p.latestVersionId ? getVersionById(p.latestVersionId)?.version || '' : '')
  }
  return m
})

function platformsOf(s: Software, max = 3): string[] {
  return (platformsMap.value.get(s.id) || []).slice(0, max)
}
function platformsMore(s: Software, max = 3): number {
  return Math.max(0, (platformsMap.value.get(s.id) || []).length - max)
}
function latestVersionText(s: Software): string {
  return latestVersionMap.value.get(s.id) || ''
}
</script>

<template>
  <AmbientOrbs />

  <div class="home">
    <!-- Hero Banner 轮播 -->
    <section class="hero">
      <button v-if="featured.length > 1" class="hero-arrow hero-arrow-left" @click="prevSlide" aria-label="上一张">‹</button>
      <div class="hero-track" :style="{ transform: `translateX(-${carouselIndex * 100}%)` }">
        <div
          v-for="(p, i) in featured"
          :key="p.id"
          class="hero-slide"
        >
          <div class="hero-content">
            <span class="hero-tag">⭐ 今日推荐</span>
            <h1 class="hero-title">{{ p.name }}</h1>
            <p class="hero-desc">{{ p.description }}</p>
            <p v-if="p.longDescription" class="hero-desc hero-desc-sub">{{ p.longDescription }}</p>
            <div class="hero-actions">
              <router-link :to="`/software/${p.slug}`" class="btn-primary">
                <span>↓</span> 立即下载
              </router-link>
              <a
                v-if="p.githubUrl"
                :href="p.githubUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="btn-secondary"
              >
                查看仓库
              </a>
            </div>
          </div>
          <div class="hero-visual">
            <div class="hero-icon-wrap">
              <img v-if="p.logo" :src="resolveProject(p)" :alt="p.name" class="hero-icon" />
              <span v-else-if="p.iconEmoji" class="hero-icon-emoji">{{ p.iconEmoji }}</span>
              <span v-else class="hero-icon-text">{{ p.name[0] }}</span>
            </div>
          </div>
        </div>
      </div>
      <button v-if="featured.length > 1" class="hero-arrow hero-arrow-right" @click="nextSlide" aria-label="下一张">›</button>
      <div v-if="featured.length > 1" class="hero-dots">
        <button
          v-for="(_, i) in featured"
          :key="i"
          :class="['dot', { active: i === carouselIndex }]"
          @click="goSlide(i)"
          :aria-label="`第 ${i + 1} 张`"
        />
      </div>
    </section>

    <!-- 软件分类 -->
    <section class="section">
      <div class="section-head">
        <h2 class="section-title">软件分类</h2>
        <router-link to="/search" class="section-more">查看全部 ›</router-link>
      </div>
      <div class="cat-grid">
        <router-link
          v-for="c in catPaginated"
          :key="c.id"
          :to="`/category/${c.slug}`"
          class="cat-card"
        >
          <div class="cat-icon">
            <span>{{ c.icon || '📦' }}</span>
          </div>
          <div class="cat-name">{{ c.name }}</div>
          <div class="cat-count">{{ projectCountByCategory(c.slug) }}+ 款软件</div>
        </router-link>
        <router-link to="/search" class="cat-card cat-card-more">
          <div class="cat-icon">
            <span>🔍</span>
          </div>
          <div class="cat-name">更多</div>
          <div class="cat-count">探索所有</div>
        </router-link>
      </div>
      <div v-if="catTotalPages > 1" class="cat-pages">
        <button class="cat-page-btn" :disabled="catPage === 0" @click="prevCatPage" aria-label="上一页">‹</button>
        <span class="cat-page-info">{{ catPage + 1 }} / {{ catTotalPages }}</span>
        <button class="cat-page-btn" :disabled="catPage === catTotalPages - 1" @click="nextCatPage" aria-label="下一页">›</button>
      </div>
    </section>

    <!-- 热门软件 -->
    <section v-if="hotProjects.length > 0" class="section">
      <div class="section-head">
        <h2 class="section-title">热门软件</h2>
        <router-link to="/ranking" class="section-more">查看全部 ›</router-link>
      </div>
      <div class="hot-grid">
        <ProjectCard v-for="p in hotProjects" :key="p.id" :software="p" hide-downloads />
      </div>
    </section>

    <!-- 最近更新 + 下载排行 -->
    <section v-if="recentlyUpdated.length > 0 || topDownloads.length > 0" class="section section-double">
      <div class="double-col">
        <div class="panel">
          <div class="panel-head">
            <h3 class="panel-title">最近更新</h3>
            <router-link to="/ranking?tab=updated" class="section-more">查看全部 ›</router-link>
          </div>
          <div class="panel-list">
            <router-link
              v-for="p in recentlyUpdated"
              :key="p.id"
              :to="`/software/${p.slug}`"
              class="cr-home"
            >
              <div class="cr-h-header">
                <div class="cr-h-icon">
                  <img v-if="p.logo" :src="resolveProject(p)" :alt="p.name" />
                  <span v-else>{{ p.name[0] }}</span>
                </div>
                <div class="cr-h-title-block">
                  <span class="cr-h-name">{{ p.name }}</span>
                  <div class="cr-h-subtitle">
                    <span v-if="p.stars" class="cr-h-stars">⭐ {{ p.stars.toFixed(1) }}</span>
                    <span v-if="latestVersionText(p)" class="cr-h-version">{{ latestVersionText(p) }}</span>
                  </div>
                </div>
              </div>
              <div v-if="platformsOf(p, 6).length" class="cr-h-platforms">
                <span
                  v-for="pl in platformsOf(p, 6)"
                  :key="pl"
                  :class="['cr-h-plat-tag', platformClass(pl)]"
                  :title="`支持 ${pl}`"
                >
                  <span>{{ platformIcon(pl) }}</span>{{ pl }}
                </span>
                <span v-if="platformsMore(p, 6) > 0" class="cr-h-plat-more">+{{ platformsMore(p, 6) }}</span>
              </div>
              <div class="cr-h-desc" :title="p.description">{{ p.description }}</div>
              <div class="cr-h-meta">
                <span class="cr-h-meta-tag">release</span>
                <span v-if="p.latestUpdateTime" class="cr-h-meta-date">{{ fmtDate(p.latestUpdateTime) }} 更新</span>
              </div>
            </router-link>
          </div>
        </div>

        <div class="panel">
          <div class="panel-head">
            <h3 class="panel-title">本周下载榜</h3>
            <router-link to="/ranking?tab=downloads" class="section-more">查看全部 ›</router-link>
          </div>
          <div class="panel-list">
            <router-link
              v-for="(p, i) in topDownloads"
              :key="p.id"
              :to="`/software/${p.slug}`"
              class="rank-item"
            >
              <span :class="['rank-num', { 'rank-top': i < 3 }]">{{ i + 1 }}</span>
              <div class="row-icon">
                <img v-if="p.logo" :src="p.logo" :alt="p.name" />
                <span v-else>{{ p.name[0] }}</span>
              </div>
              <div class="row-info">
                <div class="row-name">{{ p.name }}</div>
                <div v-if="platformsOf(p, 6).length" class="row-platline">
                  <span
                    v-for="pl in platformsOf(p, 6)"
                    :key="pl"
                    :class="['plat-tag', platformClass(pl)]"
                    :title="`支持 ${pl}`"
                  >
                    <span>{{ platformIcon(pl) }}</span>{{ pl }}
                  </span>
                  <span v-if="platformsMore(p, 6) > 0" class="plat-more">+{{ platformsMore(p, 6) }}</span>
                </div>
                <div class="row-meta">
                  <span v-if="p.stars" class="rank-stars">⭐ {{ fmtCompact(p.stars) }}</span>
                </div>
              </div>
              <div class="row-dl">↓ {{ fmtRealDownloads(p) }}</div>
            </router-link>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home {
  max-width: 1180px;
  margin: 0 auto;
  padding: 0 16px;
  position: relative;
  z-index: 1;
}

/* === Hero === */
.hero {
  position: relative;
  margin-top: 8px;
  border-radius: var(--radius-2xl);
  overflow: hidden;
  background: var(--gradient-hero);
  min-height: 280px;
  display: flex;
  align-items: center;
  box-shadow: var(--shadow-lg);
}
.hero-track {
  display: flex;
  width: 100%;
  transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}
.hero-slide {
  flex-shrink: 0;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 40px 56px;
  gap: 24px;
}
.hero-content {
  flex: 1;
  max-width: 540px;
  z-index: 1;
}
.hero-tag {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 14px;
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.5);
  backdrop-filter: blur(8px);
  color: var(--text-main);
  font-size: 0.82rem;
  font-weight: 600;
  margin-bottom: 16px;
}
.hero-title {
  font-size: clamp(1.8rem, 2.4vw + 1rem, 2.6rem);
  font-weight: 700;
  color: var(--text-main);
  margin: 0 0 12px;
  line-height: 1.2;
  letter-spacing: -0.5px;
}
.hero-desc {
  font-size: 1rem;
  color: var(--text-sec);
  margin: 0 0 4px;
  line-height: 1.5;
  max-width: 460px;
}
.hero-desc-sub {
  color: var(--text-tertiary);
  font-size: 0.92rem;
  margin-bottom: 24px;
}
.hero-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.hero-visual {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.hero-icon-wrap {
  width: 140px;
  height: 140px;
  border-radius: var(--radius-2xl);
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(20px);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.5);
  animation: float 6s ease-in-out infinite;
}
.hero-icon {
  width: 88px;
  height: 88px;
  object-fit: contain;
  border-radius: var(--radius-lg);
}
.hero-icon-emoji {
  font-size: 5rem;
  line-height: 1;
}
.hero-icon-text {
  font-size: 3.6rem;
  font-weight: 700;
  background: var(--gradient-primary);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.hero-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.8);
  color: var(--text-main);
  font-size: 1.6rem;
  line-height: 1;
  cursor: pointer;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-sm);
  transition: background 0.18s, transform 0.12s;
}
.hero-arrow:hover { background: white; transform: translateY(-50%) scale(1.05); }
.hero-arrow-left { left: 16px; }
.hero-arrow-right { right: 16px; }
.hero-dots {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 6px;
  z-index: 2;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  padding: 0;
  transition: all 0.2s;
}
.dot.active { background: white; width: 24px; border-radius: 4px; }

/* === Section === */
.section {
  margin-top: 48px;
  animation: riseFade 0.6s ease both;
}
.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 16px;
  padding: 0 4px;
}
.section-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
}
.section-more {
  font-size: 0.85rem;
  color: var(--text-tertiary);
  text-decoration: none;
  transition: color 0.18s;
}
.section-more:hover { color: var(--color-primary); }

/* === 分类卡片 === */
.cat-grid {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 12px;
}
.cat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px 12px;
  background: var(--color-card);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  text-decoration: none;
  color: var(--text-main);
  box-shadow: var(--shadow-xs);
  transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
}
.cat-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-md);
  border-color: var(--color-primary);
}
.cat-icon {
  width: 52px;
  height: 52px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--gradient-primary-soft);
  font-size: 1.5rem;
  margin-bottom: 8px;
}
.cat-name {
  font-size: 0.95rem;
  font-weight: 600;
  margin-bottom: 2px;
}
.cat-count {
  font-size: 0.75rem;
  color: var(--text-tertiary);
}
.cat-card-more {
  background: var(--color-card);
}
.cat-pages {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 14px;
}
.cat-page-btn {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid var(--border-soft);
  background: var(--color-card);
  color: var(--text-main);
  font-size: 1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.18s, border-color 0.18s;
}
.cat-page-btn:hover:not(:disabled) { background: var(--color-card-soft); border-color: var(--color-primary); }
.cat-page-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.cat-page-info {
  font-size: 0.82rem;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  min-width: 44px;
  text-align: center;
}

/* === 热门 === */
.hot-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

/* === 双列面板 === */
.section-double { margin-top: 48px; }
.double-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.panel {
  background: var(--color-card);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  padding: 18px 18px;
  box-shadow: var(--shadow-sm);
  min-width: 0;
  overflow: hidden;
}
.panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12px;
}
.panel-title {
  font-size: 1.05rem;
  font-weight: 700;
  margin: 0;
  color: var(--text-main);
}
.panel-list { display: flex; flex-direction: column; gap: 4px; }

.row-item, .rank-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 8px;
  border-radius: var(--radius-md);
  text-decoration: none;
  color: var(--text-main);
  transition: background 0.18s;
  min-width: 0;
  overflow: hidden;
}
.row-item:hover, .rank-item:hover { background: var(--color-card-soft); }
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
.row-info { flex: 1; min-width: 0; overflow: hidden; }
.row-name {
  font-size: 0.95rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
}
.row-version {
  font-size: 0.78rem;
  color: var(--color-primary);
  font-weight: 500;
  font-family: var(--font-mono);
  flex-shrink: 0;
}

/* 独占一行的平台标签（用于"最近更新"和"本周下载榜"卡片） */
.row-platline {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 4px;
  min-height: 20px;
}
.row-platline .plat-more {
  height: 20px;
  padding: 0 5px;
  font-size: 0.65rem;
  background: var(--color-card-soft);
  color: var(--text-tertiary);
  border: 1px dashed var(--border-soft);
}
.row-desc-line {
  font-size: 0.8rem;
  color: var(--text-tertiary);
  margin-top: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  min-width: 0;
  display: block;
}
.row-date {
  font-size: 0.78rem;
  color: var(--text-tertiary);
  white-space: nowrap;
  font-family: var(--font-mono);
  flex-shrink: 0;
  margin-left: auto;
}
.row-dl {
  font-size: 0.88rem;
  color: var(--text-sec);
  font-weight: 600;
  white-space: nowrap;
}

/* Homepage recent update cards - new 4-layer design */
.cr-home {
  display: flex;
  flex-direction: column;
  padding: 12px 8px;
  background: transparent;
  border-radius: var(--radius-md);
  text-decoration: none;
  color: inherit;
  transition: background 0.18s;
  gap: 8px;
}
.cr-home:hover { background: var(--color-card-soft); }
.cr-h-header {
  display: flex;
  align-items: center;
  gap: 10px;
}
.cr-h-icon {
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
.cr-h-icon img { width: 100%; height: 100%; object-fit: cover; }
.cr-h-title-block {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.cr-h-name {
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text-main);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cr-h-subtitle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
}
.cr-h-stars {
  color: #F5A623;
  font-weight: 600;
}
.cr-h-version {
  color: var(--color-primary);
  font-weight: 500;
  font-family: var(--font-mono);
  background: var(--color-primary-soft);
  padding: 0 6px;
  border-radius: var(--radius-full);
  font-size: 0.72rem;
}
.cr-h-platforms {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.cr-h-plat-tag {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.65rem;
  background: var(--color-card-soft);
  color: var(--text-sec);
  border: 1px solid var(--border-soft);
  line-height: 1.2;
}
.cr-h-plat-tag span:first-child { font-size: 0.6rem; }
.cr-h-plat-more {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  font-size: 0.6rem;
  background: var(--color-card-soft);
  color: var(--text-tertiary);
  border: 1px dashed var(--border-soft);
  border-radius: 999px;
}
.cr-h-desc {
  font-size: 0.78rem;
  color: var(--text-sec);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}
.cr-h-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.cr-h-meta-tag {
  font-size: 0.65rem;
  color: var(--text-tertiary);
  background: var(--color-card-soft);
  padding: 1px 6px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-soft);
}
.cr-h-meta-date {
  font-size: 0.65rem;
  color: var(--text-tertiary);
  white-space: nowrap;
  font-family: var(--font-mono);
}
.rank-num {
  width: 24px;
  height: 24px;
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
.rank-stars { color: var(--text-tertiary); font-size: 0.72rem; }

/* === 响应式 === */
@media (max-width: 1024px) {
  .cat-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .hot-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
}
@media (max-width: 768px) {
  .hero-slide { padding: 32px 24px; }
  .hero-visual { display: none; }
  .cat-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
  .cat-card { padding: 16px 8px; }
  .cat-icon { width: 44px; height: 44px; font-size: 1.3rem; }
  .double-col { grid-template-columns: 1fr; }
  .hot-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
}
@media (max-width: 480px) {
  .hero { min-height: 220px; }
  .hero-slide { padding: 24px 18px; }
  .hero-title { font-size: 1.5rem; }
  .hero-desc { font-size: 0.88rem; }
  .cat-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .hot-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .section { margin-top: 32px; }
  /* 手机模式：平台标签与 ProjectCard 热门卡片同尺寸，一行至少 3 个 */
  .row-platline { gap: 2px; min-height: 10px; }
  .row-platline .plat-tag {
    height: 10px;
    padding: 0 2px;
    border-radius: 2px;
    font-size: 0.33rem;
    gap: 1px;
  }
  .row-platline .plat-more {
    height: 10px;
    padding: 0 2px;
    font-size: 0.33rem;
  }
  /* 手机模式：缩排行/列表行，让软件名（如"LX Music 桌面版"）显示完整 */
  .panel { padding: 14px 12px; }
  .row-item, .rank-item { padding: 10px 6px; gap: 8px; }
  .rank-num { width: 20px; height: 20px; font-size: 0.7rem; }
  .row-icon { width: 30px; height: 30px; font-size: 0.85rem; }
  .row-name { font-size: 0.85rem; }
  .row-dl { font-size: 0.78rem; }
  .row-date { font-size: 0.72rem; }
}
</style>
