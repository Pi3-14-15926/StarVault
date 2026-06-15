<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'
import { NButton, NDrawer, NDrawerContent, NAvatar } from 'naive-ui'
import { ref, computed, onMounted } from 'vue'
import { useScheduler } from '../../composables/useScheduler'
import { getCurrentUser, clearToken } from '../../utils/auth'
import { useSettingStore } from '../../store/settings'
import { useIconUrl } from '../../composables/useIconUrl'

const router = useRouter()
const route = useRoute()
const settings = useSettingStore()
const { resolve } = useIconUrl()
const siteLogo = computed(() => resolve(settings.settings.logo))

onMounted(() => {
  settings.refresh()
  if (window.top && window.top !== window.self) {
    try {
      window.top.location.href = window.location.href
    } catch {
      document.body.innerHTML = '<div style="padding:60px 20px;text-align:center;font-family:system-ui"><h2 style="color:#E55353">⚠️ 检测到非法嵌入</h2><p style="color:#666">请直接访问本站，不要通过其他网站打开后台</p><p style="margin-top:16px"><a href="' + window.location.href + '" style="color:#3478F6">点此直达 →</a></p></div>'
    }
  }
})

useScheduler()

const menuOptions = [
  { label: '统计概览', key: '/admin/dashboard', icon: '📊' },
  { label: '软件管理', key: '/admin/projects', icon: '📦' },
  { label: '页面管理', key: '/admin/categories', icon: '📂' },
  { label: '图标管理', key: '/admin/icons', icon: '🖼️' },
  { label: '备份管理', key: '/admin/backup-files', icon: '📁' },
  { label: '网站设置', key: '/admin/settings', icon: '⚙️' },
  { label: '加速设置', key: '/admin/acceleration', icon: '⚡' },
  { label: '渠道备份', key: '/admin/channel-backup', icon: '📡' },
]

const mobileOpen = ref(false)
const user = computed(() => getCurrentUser())

function doLogout() {
  clearToken()
  router.push('/admin')
}

function handleMenuUpdate(key: string) {
  router.push(key)
  mobileOpen.value = false
}
</script>

<template>
  <div class="admin-layout">
    <!-- 桌面端侧边栏：280px 毛玻璃 -->
    <aside class="desktop-sider">
      <div class="sider-brand" @click="router.push('/admin/dashboard')">
        <img v-if="siteLogo" :src="siteLogo" :alt="settings.settings.siteName" class="brand-img" />
        <span v-else class="brand-mark">🐺</span>
        <div class="brand-text">
          <div class="brand-name">{{ settings.settings.siteName || 'Software Hub' }}</div>
          <div class="brand-sub">Admin Console</div>
        </div>
      </div>
      <nav class="sider-nav">
        <a
          v-for="m in menuOptions"
          :key="m.key"
          :class="['nav-item', { active: route.path === m.key }]"
          @click="handleMenuUpdate(m.key)"
        >
          <span class="nav-icon">{{ m.icon }}</span>
          <span class="nav-label">{{ m.label }}</span>
        </a>
      </nav>
    </aside>

    <div class="inner-layout">
      <!-- 72px 圆角白色顶栏 -->
      <header class="admin-header">
        <div class="header-left">
          <NButton class="mobile-menu-btn" @click="mobileOpen = true" circle>
            <span style="font-size:1.2rem;line-height:1">☰</span>
          </NButton>
          <h1 class="header-title">{{ route.meta?.title || '管理后台' }}</h1>
        </div>
        <div class="header-right">
          <button class="btn-ghost" @click="router.push('/')">
            <span>🏠</span> 返回首页
          </button>
          <div v-if="user" class="header-user">
            <NAvatar :src="user.avatar_url" size="small" round />
            <div class="header-user-info">
              <div class="header-user-name">{{ user.login }}</div>
              <div class="header-user-role">管理员</div>
            </div>
          </div>
          <button v-if="user" class="btn-logout" @click="doLogout">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            登出
          </button>
        </div>
      </header>
      <main class="admin-content">
        <slot />
      </main>
    </div>
  </div>

  <!-- 移动端抽屉菜单 -->
  <NDrawer v-model:show="mobileOpen" placement="left" :width="280">
    <NDrawerContent title="管理后台" closable>
      <nav class="drawer-nav">
        <a
          v-for="m in menuOptions"
          :key="m.key"
          :class="['drawer-item', { active: route.path === m.key }]"
          @click="handleMenuUpdate(m.key)"
        >
          <span class="nav-icon">{{ m.icon }}</span>
          <span class="nav-label">{{ m.label }}</span>
        </a>
      </nav>
      <div class="drawer-footer">
        <button class="btn-secondary" @click="router.push('/')">🏠 返回首页</button>
      </div>
    </NDrawerContent>
  </NDrawer>
</template>

<style scoped>
.admin-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: var(--admin-bg);
}

/* ===== 侧边栏 280px 毛玻璃 ===== */
.desktop-sider {
  width: var(--admin-sidebar-w);
  display: flex;
  flex-direction: column;
  background: var(--admin-sider-bg);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border-right: 1px solid var(--admin-border);
  flex-shrink: 0;
  z-index: 2;
}
.sider-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 22px 24px 20px;
  cursor: pointer;
  border-bottom: 1px solid var(--admin-border);
}
.brand-mark {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  background: var(--admin-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
  flex-shrink: 0;
  box-shadow: 0 6px 20px rgba(79, 140, 255, 0.32);
}
.brand-img {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  object-fit: cover;
  flex-shrink: 0;
}
.brand-text { line-height: 1.2; min-width: 0; }
.brand-name {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.brand-sub {
  font-size: 0.72rem;
  color: var(--text-tertiary);
  margin-top: 2px;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  font-weight: 500;
}

.sider-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px 14px;
  gap: 4px;
  overflow-y: auto;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 48px;
  padding: 0 16px;
  border-radius: 14px;
  color: var(--text-sec);
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  text-decoration: none;
  transition: background 0.2s ease, color 0.2s ease, transform 0.2s ease;
}
.nav-item:hover {
  background: rgba(79, 140, 255, 0.06);
  color: var(--text-main);
  transform: translateX(2px);
}
.nav-item.active {
  background: var(--admin-gradient);
  color: #FFFFFF;
  font-weight: 600;
  box-shadow: 0 8px 24px rgba(79, 140, 255, 0.32);
}
.nav-icon { font-size: 1.15rem; line-height: 1; }
.nav-label { flex: 1; }

/* ===== 顶栏 72px 圆角白色 ===== */
.inner-layout {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 16px 16px 16px 0;
}
.admin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 28px;
  height: var(--admin-header-h);
  background: var(--admin-header-bg);
  border-radius: var(--admin-radius-card);
  box-shadow: var(--admin-shadow-card);
  flex-shrink: 0;
  margin-bottom: 16px;
  overflow: hidden;
  min-width: 0;
}
.header-left { display: flex; align-items: center; gap: 12px; }
.header-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-main);
  letter-spacing: 0.2px;
}
.header-right { display: flex; align-items: center; gap: 12px; }
.header-user {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 12px 4px 4px;
  border-radius: var(--radius-full);
  background: var(--color-card-soft);
}
.header-user-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  line-height: 1.2;
}
.header-user-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-main);
  white-space: nowrap;
}
.header-user-role {
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--color-primary);
  letter-spacing: 0.3px;
  white-space: nowrap;
}

.btn-logout {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 36px;
  padding: 0 14px;
  border-radius: var(--radius-full);
  background: rgba(229, 83, 83, 0.08);
  color: #E55353;
  border: 1px solid rgba(229, 83, 83, 0.18);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s;
}
.btn-logout:hover {
  background: rgba(229, 83, 83, 0.16);
  border-color: rgba(229, 83, 83, 0.32);
  transform: translateY(-1px);
}

.admin-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 0 12px 12px 0;
  overflow: auto;
  min-height: 0;
  animation: admin-fade-in 0.25s ease;
}
@keyframes admin-fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

.mobile-menu-btn { display: none; }

.drawer-nav {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 0;
}
.drawer-item {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 48px;
  padding: 0 16px;
  border-radius: 14px;
  color: var(--text-sec);
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  text-decoration: none;
  transition: background 0.2s ease, color 0.2s ease;
}
.drawer-item:hover { background: rgba(79, 140, 255, 0.06); color: var(--text-main); }
.drawer-item.active { background: var(--admin-gradient); color: #FFFFFF; font-weight: 600; }
.drawer-footer { margin-top: 20px; }
.drawer-footer .btn-secondary { width: 100%; }

@media (max-width: 768px) {
  .desktop-sider { display: none; }
  .mobile-menu-btn { display: inline-flex; }
  .inner-layout { padding: 12px 12px 12px 0; }
  .admin-header { padding: 0 12px; border-radius: 18px; gap: 8px; min-width: 0; }
  .header-left { gap: 8px; min-width: 0; }
  .header-title { font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .header-right { gap: 8px; flex-shrink: 0; }
  .header-user-info { display: none; }
  .header-user { padding: 4px; }
  .btn-ghost { white-space: nowrap; font-size: 0.82rem; padding: 0 10px; height: 32px; }
  .btn-logout { width: 32px; padding: 0; justify-content: center; height: 32px; }
  .btn-logout svg { width: 14px; height: 14px; }
}
</style>
