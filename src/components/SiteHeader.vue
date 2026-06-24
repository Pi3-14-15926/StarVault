<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useSettingStore } from '../store/settings'
import { useIconUrl } from '../composables/useIconUrl'
import { getCurrentUser } from '../utils/auth'

const router = useRouter()
const route = useRoute()
const settings = useSettingStore()
const { resolve } = useIconUrl()
const siteLogo = computed(() => resolve(settings.settings.logo))
const keyword = ref('')

const user = computed(() => getCurrentUser())
const showUser = computed(() => route.path.startsWith('/admin') && user.value)

function doSearch() {
  const kw = keyword.value.trim()
  if (kw) router.push({ name: 'Search', query: { q: kw } })
}

function goHome() { router.push('/') }
function goManage() { router.push('/admin') }

const showAcceleration = ref(false)
const githubUrl = ref('')
const isDownloading = ref(false)
const downloadMessage = ref('')

const ghProxyUrl = computed(() => {
  const url = settings.settings.ghProxyUrl || ''
  return url.endsWith('/') ? url : url + '/'
})

function isGitHubUrl(url: string): boolean {
  return url.includes('github.com') || url.includes('githubusercontent.com')
}

function getFileName(url: string): string {
  const parts = url.split('/')
  return parts[parts.length - 1].split('?')[0] || 'download'
}

function handleAccelerate() {
  const url = githubUrl.value.trim()
  if (!url) {
    downloadMessage.value = '请输入 GitHub 链接'
    return
  }
  if (!isGitHubUrl(url)) {
    downloadMessage.value = '请输入有效的 GitHub 链接'
    return
  }
  
  isDownloading.value = true
  downloadMessage.value = '正在加速下载...'
  
  const proxyUrl = ghProxyUrl.value + url
  const fileName = getFileName(url)
  
  const link = document.createElement('a')
  link.href = proxyUrl
  link.download = fileName
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  
  setTimeout(() => {
    isDownloading.value = false
    downloadMessage.value = '下载已开始'
  }, 2000)
}

function closeAcceleration() {
  showAcceleration.value = false
  githubUrl.value = ''
  downloadMessage.value = ''
}
</script>

<template>
  <header class="site-header">
    <div class="nav-inner glass-card">
      <a class="logo-link" @click="goHome" role="button" tabindex="0" @keyup.enter="goHome">
        <img v-if="siteLogo" :src="siteLogo" :alt="settings.settings.siteName" class="logo-img" />
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
          placeholder="搜索软件…"
          class="header-search-input"
          @keyup.enter="doSearch"
        />
      </div>

      <nav class="nav-links">
        <router-link to="/" class="nav-link" active-class="nav-active" exact-active-class="nav-active">首页</router-link>
        <router-link :to="{ name: 'Search' }" class="nav-link" active-class="nav-active">探索</router-link>
        <router-link :to="{ name: 'Ranking' }" class="nav-link" active-class="nav-active">排行</router-link>
        <button class="nav-accelerate" @click="showAcceleration = true">加速</button>
        <button v-if="!showUser" class="nav-pill" @click="goManage">管理</button>
        <div v-else class="nav-user" :title="user?.login">
          <img v-if="user?.avatar_url" :src="user.avatar_url" :alt="user?.login" class="nav-avatar" />
          <span v-else class="nav-avatar nav-avatar-text">{{ user?.login?.[0] }}</span>
        </div>
      </nav>

      <Teleport to="body">
        <div v-if="showAcceleration" class="accel-modal-overlay" @click.self="closeAcceleration">
          <div class="accel-modal-content glass-card">
            <div class="accel-modal-header">
              <h3 class="accel-modal-title">加速下载</h3>
              <button class="accel-modal-close" @click="closeAcceleration">
                <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
              </button>
            </div>
            <div class="accel-modal-body">
              <p class="accel-modal-desc">输入 GitHub 仓库资源链接，自动通过代理加速下载</p>
              <div class="accel-input-group">
                <input
                  v-model="githubUrl"
                  type="url"
                  placeholder="https://github.com/user/repo/releases/download/xxx/file.zip"
                  class="accel-input"
                  @keyup.enter="handleAccelerate"
                />
              </div>
              <div v-if="downloadMessage" class="accel-message" :class="{ 'accel-message-error': downloadMessage.includes('请'), 'accel-message-success': downloadMessage.includes('开始') }">
                {{ downloadMessage }}
              </div>
              <button
                class="accel-btn"
                :disabled="isDownloading || !githubUrl.trim()"
                @click="handleAccelerate"
              >
                <svg v-if="!isDownloading" viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                <span v-else class="accel-loading"></span>
                {{ isDownloading ? '下载中...' : '加速下载' }}
              </button>
            </div>
            <div class="accel-modal-footer">
              <span class="accel-proxy-badge">
                <svg class="accel-proxy-icon" viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                公益加速
              </span>
            </div>
            <div class="accel-modal-tips">
              <div class="accel-tips-title">支持的链接类型：</div>
              <ul class="accel-tips-list">
                <li>Releases 下载：<code>github.com/.../releases/download/...</code></li>
                <li>Raw 文件：<code>github.com/.../raw/...</code></li>
                <li>Actions 产物：<code>github.com/.../actions/...</code></li>
              </ul>
            </div>
          </div>
        </div>
      </Teleport>
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
  .search-icon { left: 10px; width: 14px; height: 14px; }
  .header-search-input { height: 32px; font-size: 0.82rem; padding: 0 10px 0 30px; }
  .nav-link { padding: 6px 10px; font-size: 0.85rem; }
  .nav-pill { height: 32px; padding: 0 14px; font-size: 0.8rem; margin-left: 4px; }
}
@media (max-width: 480px) {
  .nav-inner { gap: 4px; padding: 4px 6px 4px 10px; }
  .logo-text { display: none; }
  .header-search-input { font-size: 0.78rem; padding: 0 8px 0 28px; }
  .nav-link { padding: 5px 8px; font-size: 0.8rem; }
  .nav-pill { padding: 0 10px; font-size: 0.78rem; }
  .nav-accelerate { padding: 0 10px; font-size: 0.78rem; }
}

.nav-accelerate {
  height: 36px;
  padding: 0 18px;
  border-radius: var(--radius-full);
  border: none;
  background: linear-gradient(135deg, #4FC1FF 0%, #3478F6 100%);
  color: var(--text-on-primary);
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(79, 193, 255, 0.3);
  transition: transform 0.15s, box-shadow 0.18s;
  margin-left: 8px;
}
.nav-accelerate:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(79, 193, 255, 0.4);
}
@media (max-width: 768px) {
  .nav-accelerate { height: 32px; padding: 0 14px; font-size: 0.8rem; margin-left: 4px; }
}

.accel-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.accel-modal-content {
  width: 100%;
  max-width: 480px;
  max-height: 85vh;
  overflow-y: auto;
  background: rgba(255, 255, 255, 0.95);
  border-radius: var(--radius-xl);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.15);
  animation: accelModalIn 0.2s ease;
}
@keyframes accelModalIn {
  from { opacity: 0; transform: scale(0.95) translateY(10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.accel-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 0;
}
.accel-modal-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
}
.accel-modal-close {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  border: none;
  background: var(--color-card-soft);
  color: var(--text-tertiary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.18s, color 0.18s;
}
.accel-modal-close:hover {
  background: var(--border-color);
  color: var(--text-main);
}
.accel-modal-body {
  padding: 16px 24px;
}
.accel-modal-desc {
  font-size: 0.88rem;
  color: var(--text-sec);
  margin: 0 0 16px;
  line-height: 1.5;
}
.accel-input-group {
  margin-bottom: 12px;
}
.accel-input {
  width: 100%;
  height: 48px;
  padding: 0 16px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  background: var(--color-card);
  font-size: 0.9rem;
  color: var(--text-main);
  outline: none;
  transition: border-color 0.18s, box-shadow 0.18s;
  box-sizing: border-box;
}
.accel-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-soft);
}
.accel-input::placeholder {
  color: var(--text-tertiary);
  font-size: 0.82rem;
}
.accel-message {
  font-size: 0.82rem;
  margin-bottom: 12px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
.accel-message-error {
  background: rgba(255, 107, 107, 0.1);
  color: var(--color-error);
}
.accel-message-success {
  background: rgba(60, 179, 113, 0.1);
  color: var(--color-success);
}
.accel-btn {
  width: 100%;
  height: 48px;
  border-radius: var(--radius-lg);
  border: none;
  background: var(--gradient-primary);
  color: var(--text-on-primary);
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: var(--shadow-primary);
  transition: transform 0.15s, box-shadow 0.18s, opacity 0.18s;
}
.accel-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: var(--shadow-primary-hover);
}
.accel-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.accel-loading {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: accelSpin 0.6s linear infinite;
}
@keyframes accelSpin {
  to { transform: rotate(360deg); }
}
.accel-modal-footer {
  padding: 12px 24px 16px;
  border-top: 1px solid var(--border-soft);
  display: flex;
  justify-content: center;
}
.accel-proxy-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  background: linear-gradient(135deg, rgba(255, 107, 107, 0.08) 0%, rgba(255, 142, 83, 0.08) 100%);
  border: 1px solid rgba(255, 107, 107, 0.15);
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  font-weight: 600;
  color: #FF6B6B;
}
.accel-proxy-icon {
  color: #FF6B6B;
}
.accel-modal-tips {
  padding: 0 24px 20px;
}
.accel-tips-title {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-sec);
  margin-bottom: 6px;
}
.accel-tips-list {
  margin: 0;
  padding-left: 16px;
  font-size: 0.75rem;
  color: var(--text-tertiary);
  line-height: 1.6;
}
.accel-tips-list li {
  margin-bottom: 2px;
}
.accel-tips-list code {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  background: var(--color-card-soft);
  padding: 1px 4px;
  border-radius: 4px;
  color: var(--color-primary);
}
</style>
