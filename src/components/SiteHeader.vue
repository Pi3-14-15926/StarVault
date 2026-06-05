<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useSettingStore } from '../store/settings'
import { getCurrentUser } from '../utils/auth'

const router = useRouter()
const route = useRoute()
const settings = useSettingStore()
const keyword = ref('')

const user = computed(() => getCurrentUser())
const showUser = computed(() => route.path.startsWith('/admin') && user.value)

function doSearch() {
  const kw = keyword.value.trim()
  if (kw) router.push({ name: 'Search', query: { q: kw } })
}

function goHome() { router.push('/') }
function goManage() { router.push('/admin') }
</script>

<template>
  <header class="site-header">
    <div class="nav-inner glass-card">
      <a class="logo-link" @click="goHome" role="button" tabindex="0" @keyup.enter="goHome">
        <img v-if="settings.settings.logo" :src="settings.settings.logo" :alt="settings.settings.siteName" class="logo-img" />
        <span v-else class="logo-mark">🐺</span>
        <div class="logo-text">
          <div class="logo-name">{{ settings.settings.siteName }}</div>
          <div class="logo-slogan">发现优质软件，一站下载</div>
        </div>
      </a>

      <div class="search-box">
        <svg class="search-icon" viewBox="0 0 24 24" width="16" height="16">
          <path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5Zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14Z"/>
        </svg>
        <input
          v-model="keyword"
          placeholder="搜索软件、分类或关键词..."
          class="header-search-input"
          @keyup.enter="doSearch"
        />
      </div>

      <nav class="nav-links">
        <router-link to="/" class="nav-link" active-class="nav-active" exact-active-class="nav-active">首页</router-link>
        <router-link :to="{ name: 'Search' }" class="nav-link" active-class="nav-active">探索</router-link>
        <router-link :to="{ name: 'Ranking' }" class="nav-link" active-class="nav-active">排行</router-link>
        <button v-if="!showUser" class="nav-pill" @click="goManage">管理</button>
        <div v-else class="nav-user" :title="user?.login">
          <img v-if="user?.avatar_url" :src="user.avatar_url" :alt="user?.login" class="nav-avatar" />
          <span v-else class="nav-avatar nav-avatar-text">{{ user?.login?.[0] }}</span>
        </div>
      </nav>
    </div>
  </header>
</template>

<style scoped>
.site-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  padding: 12px 16px 0;
  padding-top: calc(12px + env(safe-area-inset-top, 0px));
  pointer-events: none;
}
.nav-inner {
  max-width: 1180px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 16px 8px 20px;
  height: 64px;
  border-radius: var(--radius-full);
  pointer-events: auto;
}

.logo-link {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  cursor: pointer;
  text-decoration: none;
  color: inherit;
}
.logo-mark {
  font-size: 1.6rem;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--gradient-primary-soft);
  border-radius: var(--radius-md);
  line-height: 1;
}
.logo-img {
  height: 32px;
  width: auto;
  display: block;
}
.logo-text { line-height: 1.2; }
.logo-name {
  font-weight: 700;
  font-size: 0.95rem;
  color: var(--text-main);
  letter-spacing: 0.2px;
}
.logo-slogan {
  font-size: 0.7rem;
  color: var(--text-tertiary);
  margin-top: 1px;
}

.search-box {
  flex: 1;
  max-width: 360px;
  margin: 0 auto;
  position: relative;
}
.search-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-tertiary);
  pointer-events: none;
}
.header-search-input {
  width: 100%;
  height: 40px;
  padding: 0 16px 0 38px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-color);
  background: var(--color-card-soft);
  font-size: 0.9rem;
  color: var(--text-main);
  outline: none;
  transition: border-color 0.18s, background 0.18s, box-shadow 0.18s;
}
.header-search-input:focus {
  border-color: var(--color-primary);
  background: var(--color-card);
  box-shadow: 0 0 0 3px var(--color-primary-soft);
}
.header-search-input::placeholder { color: var(--text-tertiary); }

.nav-links {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.nav-link {
  position: relative;
  text-decoration: none;
  color: var(--text-sec);
  font-size: 0.92rem;
  padding: 8px 14px;
  border-radius: var(--radius-full);
  transition: color 0.18s, background 0.18s;
  font-weight: 500;
}
.nav-link:hover {
  color: var(--text-main);
  background: var(--color-card-soft);
}
.nav-active {
  color: var(--color-primary);
  font-weight: 600;
}
.nav-pill {
  margin-left: 8px;
  height: 36px;
  padding: 0 18px;
  border-radius: var(--radius-full);
  border: none;
  background: var(--gradient-primary);
  color: var(--text-on-primary);
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--shadow-primary);
  transition: transform 0.15s, box-shadow 0.18s;
}
.nav-pill:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-primary-hover);
}
.nav-user {
  margin-left: 8px;
  display: inline-flex;
  align-items: center;
}
.nav-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--color-card);
  box-shadow: var(--shadow-sm);
}
.nav-avatar-text {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--gradient-primary);
  color: var(--text-on-primary);
  font-weight: 700;
  font-size: 0.85rem;
}

@media (max-width: 768px) {
  .site-header { padding: 8px 10px 0; }
  .nav-inner { height: 56px; gap: 8px; padding: 6px 10px 6px 14px; }
  .logo-mark { width: 32px; height: 32px; font-size: 1.3rem; }
  .logo-slogan { display: none; }
  .logo-name { font-size: 0.88rem; }
  .search-box { max-width: none; flex: 1; margin: 0; }
  .nav-link { padding: 6px 10px; font-size: 0.85rem; }
  .nav-pill { height: 32px; padding: 0 14px; font-size: 0.8rem; margin-left: 4px; }
}
@media (max-width: 480px) {
  .nav-inner { gap: 4px; padding: 4px 6px 4px 10px; }
  .logo-text { display: none; }
  .nav-link { padding: 5px 8px; font-size: 0.8rem; }
  .nav-pill { padding: 0 10px; font-size: 0.78rem; }
}
</style>
