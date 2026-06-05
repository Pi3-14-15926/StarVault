<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'
import { NButton, NDrawer, NDrawerContent, NAvatar, NDropdown } from 'naive-ui'
import { ref, computed } from 'vue'
import { useScheduler } from '../../composables/useScheduler'
import { getCurrentUser, clearToken } from '../../utils/auth'

const router = useRouter()
const route = useRoute()

useScheduler()

const menuOptions = [
  { label: '仪表盘', key: '/admin/dashboard', icon: '📊' },
  { label: '软件管理', key: '/admin/projects', icon: '📦' },
  { label: '页面管理', key: '/admin/categories', icon: '📂' },
  { label: 'WebDAV 备份', key: '/admin/backup', icon: '💾' },
  { label: '导入导出', key: '/admin/backup-data', icon: '📋' },
  { label: '网站设置', key: '/admin/settings', icon: '⚙️' },
]

const mobileOpen = ref(false)
const user = computed(() => getCurrentUser())

const userDropdownOptions = [
  { label: '登出', key: 'logout' },
]

function handleUserAction(key: string) {
  if (key === 'logout') {
    clearToken()
    router.push('/admin')
  }
}

function handleMenuUpdate(key: string) {
  router.push(key)
  mobileOpen.value = false
}
</script>

<template>
  <div class="admin-layout">
    <!-- 桌面端侧边栏 -->
    <aside class="desktop-sider">
      <div class="sider-brand" @click="router.push('/admin/dashboard')">
        <span class="brand-mark">🐺</span>
        <div class="brand-text">
          <div class="brand-name">Software Hub</div>
          <div class="brand-sub">管理后台</div>
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
      <div class="sider-footer" v-if="user">
        <NDropdown :options="userDropdownOptions" @select="handleUserAction">
          <div class="user-card">
            <NAvatar :src="user.avatar_url" size="medium" round />
            <div class="user-info">
              <div class="user-name">{{ user.login }}</div>
              <div class="user-role">管理员</div>
            </div>
            <span class="user-arrow">⌄</span>
          </div>
        </NDropdown>
      </div>
    </aside>

    <div class="inner-layout">
      <header class="admin-header">
        <div class="header-left">
          <NButton class="mobile-menu-btn" @click="mobileOpen = true" circle>
            <span style="font-size:1.2rem;line-height:1">☰</span>
          </NButton>
          <span class="header-title">管理后台</span>
        </div>
        <div class="header-right">
          <button class="btn-ghost" @click="router.push('/')">
            <span>🏠</span> 返回首页
          </button>
          <button class="header-bell" title="通知">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6V11a6 6 0 0 0-5-5.91V4a1 1 0 0 0-2 0v1.09A6 6 0 0 0 6 11v5l-2 2v1h16v-1l-2-2z"/>
            </svg>
            <span class="bell-dot"></span>
          </button>
        </div>
      </header>
      <main class="admin-content">
        <slot />
      </main>
    </div>
  </div>

  <!-- 移动端抽屉菜单 -->
  <NDrawer v-model:show="mobileOpen" placement="left" :width="240">
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
  background: var(--color-bg);
}

.desktop-sider {
  width: 220px;
  display: flex;
  flex-direction: column;
  background: var(--color-card);
  border-right: 1px solid var(--border-soft);
  flex-shrink: 0;
}
.sider-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 18px;
  cursor: pointer;
  border-bottom: 1px solid var(--border-soft);
}
.brand-mark {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  background: var(--gradient-primary-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
}
.brand-text { line-height: 1.2; }
.brand-name {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-main);
}
.brand-sub {
  font-size: 0.72rem;
  color: var(--text-tertiary);
  margin-top: 1px;
}

.sider-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 12px 8px;
  gap: 2px;
  overflow-y: auto;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  color: var(--text-sec);
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  text-decoration: none;
  transition: background 0.18s, color 0.18s;
}
.nav-item:hover {
  background: var(--color-card-soft);
  color: var(--text-main);
}
.nav-item.active {
  background: var(--gradient-primary-soft);
  color: var(--color-primary);
  font-weight: 600;
}
.nav-icon { font-size: 1.1rem; line-height: 1; }
.nav-label { flex: 1; }

.sider-footer {
  padding: 12px;
  border-top: 1px solid var(--border-soft);
}
.user-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background 0.18s;
}
.user-card:hover { background: var(--color-card-soft); }
.user-info { flex: 1; min-width: 0; }
.user-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.user-role {
  font-size: 0.7rem;
  color: var(--text-tertiary);
}
.user-arrow { color: var(--text-tertiary); font-size: 0.9rem; }

.inner-layout {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.admin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  height: 60px;
  background: var(--color-card);
  border-bottom: 1px solid var(--border-soft);
  flex-shrink: 0;
}
.header-left { display: flex; align-items: center; gap: 12px; }
.header-title {
  font-weight: 700;
  font-size: 1rem;
  color: var(--text-main);
}
.header-right { display: flex; align-items: center; gap: 8px; }
.header-bell {
  position: relative;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  border: none;
  background: transparent;
  color: var(--text-sec);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.18s;
}
.header-bell:hover { background: var(--color-card-soft); color: var(--text-main); }
.bell-dot {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 8px;
  height: 8px;
  background: var(--color-error);
  border-radius: 50%;
  border: 2px solid var(--color-card);
}

.admin-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 24px;
  overflow: auto;
  min-height: 0;
}

.mobile-menu-btn { display: none; }

.drawer-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.drawer-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  color: var(--text-sec);
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  text-decoration: none;
}
.drawer-item:hover { background: var(--color-card-soft); color: var(--text-main); }
.drawer-item.active { background: var(--gradient-primary-soft); color: var(--color-primary); font-weight: 600; }
.drawer-footer { margin-top: 16px; }
.drawer-footer .btn-secondary { width: 100%; }

@media (min-width: 769px) {
  .header-title { display: none; }
}
@media (max-width: 768px) {
  .desktop-sider { display: none; }
  .mobile-menu-btn { display: inline-flex; }
  .admin-content { padding: 16px 12px; }
}
</style>
