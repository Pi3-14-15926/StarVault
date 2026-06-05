<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useProjectStore } from '../store/project'
import { useCategoryStore } from '../store/category'
import { useSettingStore } from '../store/settings'
import { fmtDate, fmtCompact } from '../utils'
import ProjectCard from '../components/ProjectCard.vue'
import AmbientOrbs from '../components/AmbientOrbs.vue'

const projects = useProjectStore()
const categories = useCategoryStore()
const settings = useSettingStore()

/* 分类图标（柔和渐变背景 + 字符） */
const categoryIconColors: Record<string, string> = {
  default: 'linear-gradient(135deg, #3478F6 0%, #8C6CFF 100%)',
}

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
  const real = projects.projects.filter(p => p.featured)
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
})
onUnmounted(() => { if (timer) clearInterval(timer) })

/* 分类下软件数量 */
function projectCountByCategory(cid: string): number {
  return projects.projects.filter(p => p.categoryId === cid).length
}

/* 热门软件（按 Star 排序） */
const hotProjects = computed(() => {
  return [...projects.projects]
    .filter(p => p.sourceType === 'github' && (p.stars ?? 0) > 0)
    .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))
    .slice(0, 3)
})

/* 最近更新（按 latestUpdateTime 倒序） */
const recentlyUpdated = computed(() => {
  return [...projects.projects]
    .filter(p => p.latestUpdateTime)
    .sort((a, b) => new Date(b.latestUpdateTime).getTime() - new Date(a.latestUpdateTime).getTime())
    .slice(0, 3)
})

/* 本周下载榜（按 downloads 累计） */
function totalDownloads(p: any): number {
  return (p.versions || []).reduce((s: number, v: any) => s + (v.downloads?.length || 0), 0)
}
const topDownloads = computed(() => {
  return [...projects.projects]
    .sort((a, b) => totalDownloads(b) - totalDownloads(a))
    .slice(0, 3)
})

function categoryFor(cid: string) {
  return categories.categories.find(c => c.id === cid)
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
              <img v-if="p.logo" :src="p.logo" :alt="p.name" class="hero-icon" />
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
          v-for="c in categories.categories"
          :key="c.id"
          :to="`/category/${c.slug}`"
          class="cat-card"
        >
          <div class="cat-icon">
            <span>{{ c.icon || '📦' }}</span>
          </div>
          <div class="cat-name">{{ c.name }}</div>
          <div class="cat-count">{{ projectCountByCategory(c.id) }}+ 款软件</div>
        </router-link>
        <router-link to="/search" class="cat-card cat-card-more">
          <div class="cat-icon">
            <span>🔍</span>
          </div>
          <div class="cat-name">更多</div>
          <div class="cat-count">探索所有</div>
        </router-link>
      </div>
    </section>

    <!-- 热门软件 -->
    <section v-if="hotProjects.length > 0" class="section">
      <div class="section-head">
        <h2 class="section-title">热门软件</h2>
        <router-link to="/search" class="section-more">查看全部 ›</router-link>
      </div>
      <div class="hot-grid">
        <ProjectCard v-for="p in hotProjects" :key="p.id" :project="p" />
      </div>
    </section>

    <!-- 最近更新 + 下载排行 -->
    <section v-if="recentlyUpdated.length > 0 || topDownloads.length > 0" class="section section-double">
      <div class="double-col">
        <div class="panel">
          <div class="panel-head">
            <h3 class="panel-title">最近更新</h3>
            <router-link to="/search" class="section-more">查看全部 ›</router-link>
          </div>
          <div class="panel-list">
            <router-link
              v-for="p in recentlyUpdated"
              :key="p.id"
              :to="`/software/${p.slug}`"
              class="row-item"
            >
              <div class="row-icon">
                <img v-if="p.logo" :src="p.logo" :alt="p.name" />
                <span v-else>{{ p.name[0] }}</span>
              </div>
              <div class="row-info">
                <div class="row-name">{{ p.name }} <span class="row-version">{{ p.latestVersion }}</span></div>
                <div class="row-desc-line" :title="p.description">{{ p.description }}</div>
              </div>
              <div class="row-date">{{ fmtDate(p.latestUpdateTime) }}</div>
            </router-link>
          </div>
        </div>

        <div class="panel">
          <div class="panel-head">
            <h3 class="panel-title">本周下载榜</h3>
            <router-link to="/search" class="section-more">查看全部 ›</router-link>
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
                <div class="row-meta">
                  <span v-if="p.stars" class="rank-stars">⭐ {{ fmtCompact(p.stars) }}</span>
                </div>
              </div>
              <div class="row-dl">↓ {{ totalDownloads(p) }}w</div>
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
  padding: 10px 8px;
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
}
</style>
