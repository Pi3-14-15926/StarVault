<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import { useProjectStore } from '../../store/project'
import { useCategoryStore } from '../../store/category'
import { syncAllGitHub } from '../../utils/api'
import AdminLayout from '../../components/admin/AdminLayout.vue'

const router = useRouter()
const message = useMessage()
const projects = useProjectStore()
const categories = useCategoryStore()

const syncing = ref(false)
const syncResult = ref('')

const githubCount = computed(() => projects.projects.filter(p => p.sourceType === 'github').length)
const customCount = computed(() => projects.projects.filter(p => p.sourceType === 'custom').length)
const totalVersions = computed(() =>
  projects.projects.reduce((sum, p) => sum + p.versions.length, 0),
)
const totalStars = computed(() => projects.projects.reduce((s, p) => s + (p.stars ?? 0), 0))

async function doSync() {
  syncing.value = true
  syncResult.value = ''
  try {
    const results = await syncAllGitHub()
    const ok = results.filter((r) => r.success).length
    syncResult.value = `同步完成：${ok}/${results.length} 个项目成功`
    message.success(syncResult.value)
  } catch (e: any) {
    syncResult.value = `同步失败：${e.message}`
    message.error(syncResult.value)
  }
  syncing.value = false
}

const stats = computed(() => [
  { label: '软件总数', value: projects.projects.length, desc: '所有已添加的软件', color: 'blue', icon: '📦' },
  { label: '页面总数', value: categories.categories.length, desc: '用于分类聚合', color: 'purple', icon: '📂' },
  { label: 'GitHub 项目', value: githubCount.value, desc: '可自动同步版本', color: 'green', icon: '🔗' },
  { label: '自定义项目', value: customCount.value, desc: '手动维护', color: 'orange', icon: '✏️' },
  { label: '版本总数', value: totalVersions.value, desc: '所有软件累计', color: 'pink', icon: '🚀' },
  { label: 'Star 总数', value: totalStars.value.toLocaleString(), desc: 'GitHub Star 累计', color: 'cyan', icon: '⭐' },
])

onMounted(() => {
  projects.refresh()
  categories.refresh()
})
</script>

<template>
  <AdminLayout>
    <div class="dash-scroll">
      <div class="dash-header">
        <div>
          <h2 class="page-title">仪表盘</h2>
          <p class="page-desc">Software Hub 管理后台概览</p>
        </div>
      </div>

      <div class="stats-grid">
        <div
          v-for="s in stats"
          :key="s.label"
          :class="['stat-card', `stat-${s.color}`]"
        >
          <div class="stat-icon">{{ s.icon }}</div>
          <div class="stat-content">
            <div class="stat-value">{{ s.value }}</div>
            <div class="stat-title">{{ s.label }}</div>
            <div class="stat-desc">{{ s.desc }}</div>
          </div>
        </div>
      </div>

      <div class="action-grid">
        <div class="action-card">
          <div class="action-icon">🔄</div>
          <div class="action-content">
            <h3 class="action-title">GitHub 同步</h3>
            <p class="action-desc">一键拉取所有 GitHub 项目的最新 Release 版本</p>
            <div class="action-buttons">
              <button class="btn-primary" :disabled="syncing" @click="doSync">
                {{ syncing ? '同步中...' : '手动同步' }}
              </button>
              <button class="btn-secondary" @click="router.push('/admin/projects')">管理软件</button>
              <button class="btn-secondary" @click="router.push('/admin/categories')">管理页面</button>
            </div>
            <div v-if="syncResult" class="action-result">{{ syncResult }}</div>
          </div>
        </div>

        <div class="action-card">
          <div class="action-icon">💾</div>
          <div class="action-content">
            <h3 class="action-title">WebDAV 备份</h3>
            <p class="action-desc">将 GitHub Release 的下载文件备份到云盘</p>
            <div class="action-buttons">
              <button class="btn-primary" @click="router.push('/admin/backup')">前往备份</button>
            </div>
          </div>
        </div>

        <div class="action-card">
          <div class="action-icon">📋</div>
          <div class="action-content">
            <h3 class="action-title">数据导入导出</h3>
            <p class="action-desc">将本地数据发布到 GitHub 仓库，触发全站更新</p>
            <div class="action-buttons">
              <button class="btn-primary" @click="router.push('/admin/backup-data')">前往导入导出</button>
            </div>
          </div>
        </div>

        <div class="action-card">
          <div class="action-icon">⚙️</div>
          <div class="action-content">
            <h3 class="action-title">站点设置</h3>
            <p class="action-desc">配置站点名称、Logo、GitHub 代理等全局选项</p>
            <div class="action-buttons">
              <button class="btn-primary" @click="router.push('/admin/settings')">前往设置</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </AdminLayout>
</template>

<style scoped>
.dash-scroll {
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.dash-header { margin-bottom: 4px; }
.page-title {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0 0 4px;
}
.page-desc {
  font-size: 0.88rem;
  color: var(--text-tertiary);
  margin: 0;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.stat-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  background: var(--color-card);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
  transition: transform 0.18s, box-shadow 0.18s;
  position: relative;
  overflow: hidden;
}
.stat-card::before {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 100px;
  height: 100px;
  border-radius: 50%;
  filter: blur(40px);
  opacity: 0.4;
  transform: translate(30%, -30%);
}
.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}
.stat-blue::before { background: rgba(52, 120, 246, 0.3); }
.stat-purple::before { background: rgba(140, 108, 255, 0.3); }
.stat-green::before { background: rgba(60, 179, 113, 0.3); }
.stat-orange::before { background: rgba(240, 160, 32, 0.3); }
.stat-pink::before { background: rgba(255, 107, 107, 0.3); }
.stat-cyan::before { background: rgba(79, 193, 255, 0.3); }

.stat-icon {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  background: var(--color-card-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
  flex-shrink: 0;
  position: relative;
  z-index: 1;
}
.stat-content { flex: 1; min-width: 0; position: relative; z-index: 1; }
.stat-value {
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--text-main);
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}
.stat-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-main);
  margin-top: 2px;
}
.stat-desc {
  font-size: 0.72rem;
  color: var(--text-tertiary);
  margin-top: 1px;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}
.action-card {
  display: flex;
  gap: 14px;
  padding: 20px;
  background: var(--color-card);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
  transition: transform 0.18s, box-shadow 0.18s;
}
.action-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}
.action-icon {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  background: var(--gradient-primary-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
  flex-shrink: 0;
}
.action-content { flex: 1; min-width: 0; }
.action-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0 0 4px;
}
.action-desc {
  font-size: 0.85rem;
  color: var(--text-sec);
  margin: 0 0 12px;
  line-height: 1.5;
}
.action-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.action-result {
  margin-top: 10px;
  font-size: 0.85rem;
  color: var(--color-success);
  font-weight: 500;
}

@media (max-width: 768px) {
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .stat-card { padding: 14px 16px; }
  .stat-value { font-size: 1.3rem; }
  .action-grid { grid-template-columns: 1fr; }
}
</style>
