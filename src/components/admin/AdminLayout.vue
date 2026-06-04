<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'
import { NMenu, NButton, NDrawer, NDrawerContent } from 'naive-ui'
import { ref } from 'vue'
import type { MenuOption } from 'naive-ui'
import { useScheduler } from '../../composables/useScheduler'

const router = useRouter()
const route = useRoute()

useScheduler()

const menuOptions: MenuOption[] = [
  { label: '仪表盘', key: '/admin/dashboard', icon: () => '📊' },
  { label: '软件管理', key: '/admin/projects', icon: () => '📦' },
  { label: '页面管理', key: '/admin/categories', icon: () => '📂' },
  { label: 'WebDAV 备份', key: '/admin/backup', icon: () => '💾' },
  { label: '网站设置', key: '/admin/settings', icon: () => '⚙️' },
]

const mobileOpen = ref(false)

function handleMenuUpdate(key: string) {
  router.push(key)
  mobileOpen.value = false
}
</script>

<template>
  <div class="admin-layout">
    <!-- 桌面端侧边栏 -->
    <aside class="desktop-sider">
      <div class="sider-header">
        <span class="sider-title">管理后台</span>
      </div>
      <NMenu
        :value="route.path"
        :options="menuOptions"
        @update:value="handleMenuUpdate"
      />
    </aside>

    <div class="inner-layout">
      <header class="admin-header">
        <div class="header-left">
          <NButton size="small" class="mobile-menu-btn" @click="mobileOpen = true">
            ☰
          </NButton>
          <span class="header-title">管理后台</span>
          <NButton size="small" type="primary" ghost @click="router.push('/')">
            🏠 返回首页
          </NButton>
        </div>
      </header>
      <main class="admin-content">
        <slot />
      </main>
    </div>
  </div>

  <!-- 移动端抽屉菜单 -->
  <NDrawer v-model:show="mobileOpen" placement="left" :width="220">
    <NDrawerContent title="管理后台">
      <NMenu
        :value="route.path"
        :options="menuOptions"
        @update:value="handleMenuUpdate"
      />
      <div class="drawer-footer">
        <NButton quaternary size="small" @click="router.push('/')">🏠 返回首页</NButton>
      </div>
    </NDrawerContent>
  </NDrawer>
</template>

<style scoped>
.admin-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}
.desktop-sider {
  width: 200px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-color);
  background: var(--card-bg);
  overflow: hidden;
}
.sider-header {
  padding: 16px 12px;
  font-weight: 700;
  text-align: center;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.sider-title { font-size: 1rem; }

.inner-layout {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.admin-header {
  display: flex;
  align-items: center;
  padding: 8px 20px;
  height: 48px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.header-title {
  font-weight: 700;
  font-size: 0.95rem;
  margin-right: auto;
}
.mobile-menu-btn { display: none; }
.admin-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 24px;
  overflow: auto;
  min-height: 0;
}
.drawer-footer { padding: 16px 0; }

/* 桌面端 */
@media (min-width: 769px) {
  .header-title { display: none; }
}

/* 移动端 */
@media (max-width: 768px) {
  .desktop-sider { display: none; }
  .mobile-menu-btn { display: inline-flex; }
  .header-title { display: inline; }
  .admin-content { padding: 16px 12px; }
}
</style>
