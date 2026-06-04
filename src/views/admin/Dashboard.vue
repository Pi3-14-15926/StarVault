<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NCard, NSpace } from 'naive-ui'
import { useProjectStore } from '../../store/project'
import { useCategoryStore } from '../../store/category'
import { syncAllGitHub } from '../../utils/api'
import AdminLayout from '../../components/admin/AdminLayout.vue'

const router = useRouter()
const projects = useProjectStore()
const categories = useCategoryStore()

const syncing = ref(false)
const syncResult = ref('')

const githubCount = computed(() => projects.projects.filter(p => p.sourceType === 'github').length)
const customCount = computed(() => projects.projects.filter(p => p.sourceType === 'custom').length)

const totalVersions = computed(() =>
  projects.projects.reduce((sum, p) => sum + p.versions.length, 0),
)

async function doSync() {
  syncing.value = true
  syncResult.value = ''
  try {
    const results = await syncAllGitHub()
    const ok = results.filter((r) => r.success).length
    syncResult.value = `同步完成：${ok}/${results.length} 个项目成功`
  } catch (e: any) {
    syncResult.value = `同步失败：${e.message}`
  }
  syncing.value = false
}

onMounted(() => {
  projects.refresh()
  categories.refresh()
})
</script>

<template>
  <AdminLayout>
    <div class="dash-scroll">
    <h2 class="page-title">📊 仪表盘</h2>

    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-value">{{ projects.projects.length }}</div>
        <div class="stat-title">软件总数</div>
        <div class="stat-desc">所有已添加的软件项目总量</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ categories.categories.length }}</div>
        <div class="stat-title">页面总数</div>
        <div class="stat-desc">用来分类聚合软件的内容页面</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ githubCount }}</div>
        <div class="stat-title">GitHub 项目</div>
        <div class="stat-desc">关联 GitHub 仓库，可自动同步版本</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ customCount }}</div>
        <div class="stat-title">自定义项目</div>
        <div class="stat-desc">手动维护，不上 GitHub 的软件</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ totalVersions }}</div>
        <div class="stat-title">版本总数</div>
        <div class="stat-desc">所有软件的版本累计数量</div>
      </div>
    </div>

    <NCard title="GitHub 同步" class="sync-card">
      <p class="sync-desc">一键拉取所有 GitHub 项目的最新 Release 版本</p>
      <NSpace>
        <NButton type="primary" :loading="syncing" @click="doSync">手动同步</NButton>
        <NButton @click="router.push('/admin/projects')">管理软件</NButton>
        <NButton @click="router.push('/admin/categories')">管理页面</NButton>
      </NSpace>
      <p v-if="syncResult" class="sync-result">{{ syncResult }}</p>
    </NCard>
    </div>
  </AdminLayout>
</template>

<style scoped>
.page-title { margin: 0 0 24px; font-size: 1.3rem; }

.stats-row {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 24px;
}
.stat-card {
  flex: 1 1 160px;
  min-width: 140px;
  background: var(--card-bg);
  border-radius: var(--border-radius);
  padding: 22px 20px;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
  text-align: center;
  transition: transform 0.15s, box-shadow 0.15s;
}
.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}
.stat-value {
  font-family: var(--font-display);
  font-size: 2rem;
  font-weight: 700;
  color: var(--primary-color);
  line-height: 1.2;
  margin-bottom: 4px;
}
.stat-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-main);
  margin-bottom: 4px;
}
.stat-desc {
  font-size: 0.78rem;
  color: var(--text-sec);
  line-height: 1.4;
}

.sync-card { margin-top: 0; }
.sync-desc { font-size: 0.9rem; color: var(--text-sec); margin-bottom: 12px; }
.sync-result { margin-top: 10px; font-size: 0.9rem; color: var(--accent-teal); }
.dash-scroll { overflow-y: auto; flex: 1; min-height: 0; }

@media (max-width: 768px) {
  .stat-card { flex: 1 1 calc(50% - 14px); min-width: 0; padding: 16px 14px; }
  .stat-value { font-size: 1.5rem; }
}
</style>
