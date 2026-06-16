<script setup lang="ts">
/* ===== 根组件 ===== */
import { computed, watch, onErrorCaptured, onMounted, onUnmounted } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { NMessageProvider, createDiscreteApi } from 'naive-ui'
import SiteHeader from './components/SiteHeader.vue'
import SiteFooter from './components/SiteFooter.vue'
import { useSettingStore } from './store/settings'
import { loadRemoteData } from './utils/api'

const route = useRoute()
const isAdmin = computed(() => route.path.startsWith('/admin'))
const settings = useSettingStore()

onErrorCaptured((err) => {
  console.error('全局错误:', err)
  return false
})

watch(() => settings.settings, (s) => {
  document.title = s.siteName || 'Software Hub'
}, { immediate: true, deep: true })

/* ===== 远程数据自动更新检测 ===== */
const POLL_INTERVAL = 5 * 60 * 1000
let pollTimer: number | null = null
const { message: messageApi } = createDiscreteApi(['message'])

async function checkRemoteUpdate(showToast: boolean) {
  try {
    const updated = await loadRemoteData()
    if (updated) {
      if (showToast) {
        messageApi.success('网站数据有更新，正在刷新...', { duration: 2000 })
        setTimeout(() => location.reload(), 1200)
      }
    }
  } catch (e) {
    console.warn('远程数据检测失败:', e)
  }
}

onMounted(() => {
  pollTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') {
      checkRemoteUpdate(true)
    }
  }, POLL_INTERVAL)
  document.addEventListener('visibilitychange', onVisibility)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  document.removeEventListener('visibilitychange', onVisibility)
})

function onVisibility() {
  if (document.visibilityState === 'visible') {
    checkRemoteUpdate(true)
  }
}
</script>

<template>
  <NMessageProvider>
    <!-- 后台页面：不套 main，直接渲染 RouterView（AdminLayout 自包含全屏） -->
    <template v-if="isAdmin">
      <RouterView />
    </template>

    <!-- 前台页面：标准 header + main + footer 布局 -->
    <template v-else>
      <SiteHeader />
      <main>
        <RouterView />
      </main>
      <SiteFooter />
    </template>
  </NMessageProvider>
</template>
