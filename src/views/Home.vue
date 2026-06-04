<script setup lang="ts">
import { useCategoryStore } from '../store/category'
import { useSettingStore } from '../store/settings'
import AmbientOrbs from '../components/AmbientOrbs.vue'

const categories = useCategoryStore()
const settings = useSettingStore()

const accentColors = ['#2a9d8f', '#dd5e43', '#4a7cba', '#b88b4a', '#8a6db0', '#c05a7a']
</script>

<template>
  <AmbientOrbs />

  <div class="container">
    <header>
      <h1>{{ settings.settings.siteName }}</h1>
      <p class="tagline">发现优质软件 · 一站下载</p>
      <div class="card-grid">
        <router-link
          v-for="(c, i) in categories.categories"
          :key="c.id"
          :to="`/category/${c.slug}`"
          class="page-card"
          :style="{ '--card-accent': accentColors[i % accentColors.length] }"
        >
          <span class="card-icon">{{ c.icon }}</span>
          <span class="card-name">{{ c.name }}</span>
          <span v-if="c.description" class="card-desc">{{ c.description }}</span>
        </router-link>
        <router-link to="/search" class="page-card search-card">
          <span class="card-icon">🔍</span>
          <span class="card-name">搜索</span>
          <span class="card-desc">探索所有软件</span>
        </router-link>
      </div>
    </header>

    <footer></footer>
  </div>
</template>

<style scoped>
.container {
  max-width: 680px;
  width: 100%;
  margin: 0 auto;
  position: relative;
  z-index: 1;
}

header {
  text-align: center;
  margin-bottom: 30px;
  padding: 50px 0 20px;
  animation: riseFade 0.6s ease both;
}
h1 {
  font-family: var(--font-display);
  color: var(--text-main);
  margin: 0 0 6px;
  font-weight: 700;
  letter-spacing: 0.4px;
  font-size: clamp(1.9rem, 2vw + 1.2rem, 2.6rem);
}
.tagline {
  color: var(--text-sec);
  font-size: 0.92rem;
  margin: 0 0 32px;
}
.card-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  justify-content: center;
}

.page-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 150px;
  height: 150px;
  padding: 20px 16px;
  border-radius: 20px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
  text-decoration: none;
  color: var(--text-main);
  position: relative;
  overflow: hidden;
  transition: transform 0.25s ease, box-shadow 0.25s ease;
  animation: riseFade 0.6s ease both;
}
.page-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: var(--card-accent, var(--accent-teal));
  opacity: 0.6;
}
.page-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 20px 40px rgba(31, 27, 22, 0.12);
  border-color: var(--card-accent, var(--accent-teal));
}

.card-icon {
  font-size: 1.8rem;
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--card-accent, var(--accent-teal)) 14%, transparent);
  border-radius: 16px;
  margin-bottom: 2px;
}
.card-name {
  font-weight: 700;
  font-size: 0.95rem;
  text-align: center;
  line-height: 1.3;
}
.card-desc {
  font-size: 0.75rem;
  color: var(--text-sec);
  text-align: center;
  line-height: 1.3;
}

.search-card {
  background: rgba(255, 255, 255, 0.55);
  border-style: dashed;
  --card-accent: var(--accent-teal);
}
.search-card .card-icon {
  background: rgba(42, 157, 143, 0.12);
}

footer {
  text-align: center;
  margin-top: 50px;
  color: var(--text-sec);
  font-size: 0.82rem;
  padding-bottom: 20px;
}

.page-card:nth-child(1) { animation-delay: 0.05s; }
.page-card:nth-child(2) { animation-delay: 0.1s; }
.page-card:nth-child(3) { animation-delay: 0.15s; }
.page-card:nth-child(4) { animation-delay: 0.2s; }
.page-card:nth-child(5) { animation-delay: 0.25s; }
.page-card:nth-child(6) { animation-delay: 0.3s; }
</style>
