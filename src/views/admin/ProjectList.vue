<script setup lang="ts">
import { ref, computed, h } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { NButton, NTag, NDataTable, NSpace, NPopconfirm, NInput } from 'naive-ui'
import { useProjectStore } from '../../store/project'
import { useCategoryStore } from '../../store/category'
import type { Project } from '../../types'
import { fmtDate } from '../../utils'
import AdminLayout from '../../components/admin/AdminLayout.vue'

const router = useRouter()
const route = useRoute()
const projects = useProjectStore()
const categories = useCategoryStore()

const categoryId = computed(() => route.params.id as string | undefined)
const category = computed(() => categories.categories.find((c) => c.id === categoryId.value))

const keyword = ref('')

const filteredList = computed(() => {
  let list = projects.projects
  if (categoryId.value) {
    list = list.filter((p) => p.categoryId === categoryId.value)
  }
  const kw = keyword.value.trim().toLowerCase()
  if (kw) {
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(kw) ||
        p.slug.toLowerCase().includes(kw) ||
        p.githubRepo?.toLowerCase().includes(kw),
    )
  }
  return list
})

function doDelete(id: string) { projects.remove(id) }
function goEdit(id: string) { router.push(`/admin/projects/${id}/edit`) }
function goVersions(id: string) { router.push(`/admin/projects/${id}/versions`) }
function doSync(project: Project) {
  if (project.sourceType !== 'github') return
  import('../../utils/api').then((api) => {
    api.syncGitHubProject(project).then(() => projects.refresh())
  })
}

const columns = [
  {
    title: '名称',
    key: 'name',
    width: 200,
    render(row: Project) {
      return h('div', { class: 'name-cell' }, [
        h('img', { src: row.logo, class: 'name-logo', onError: (e: any) => (e.target.style.display = 'none') }),
        h('div', { class: 'name-info' }, [
          h('div', { class: 'name-text' }, row.name),
          h('div', { class: 'name-slug' }, row.slug),
        ]),
      ])
    },
  },
  {
    title: '类型',
    key: 'sourceType',
    width: 90,
    render(row: Project) {
      return h(NTag, { type: row.sourceType === 'github' ? 'info' : 'warning', size: 'small', round: true }, () =>
        row.sourceType === 'github' ? 'GitHub' : '自定义',
      )
    },
  },
  { title: '最新版本', key: 'latestVersion', width: 120 },
  {
    title: '更新时间',
    key: 'latestUpdateTime',
    width: 120,
    render(row: Project) {
      return fmtDate(row.latestUpdateTime)
    },
  },
  {
    title: '操作',
    key: 'actions',
    width: 260,
    render(row: Project) {
      return h(NSpace, { size: 'small' }, () => [
        h(NButton, { size: 'small', type: 'primary', onClick: () => goEdit(row.id) }, () => '编辑'),
        h(NButton, { size: 'small', onClick: () => goVersions(row.id) }, () => '版本'),
        row.sourceType === 'github'
          ? h(NButton, { size: 'small', tertiary: true, onClick: () => doSync(row) }, () => '同步')
          : null,
        h(NPopconfirm, { positiveText: '确认', negativeText: '取消', onPositiveClick: () => doDelete(row.id) }, {
          default: () => '确定删除此项目？',
          trigger: () => h(NButton, { size: 'small', type: 'error', tertiary: true }, () => '删除'),
        }),
      ])
    },
  },
]
</script>

<template>
  <AdminLayout>
    <div class="list-page">
      <div class="page-header">
        <div class="header-left">
          <span v-if="categoryId" class="back-link" @click="router.push('/admin/categories')">← 返回页面管理</span>
          <h2 class="page-title">{{ category ? `${category.icon} ${category.name} — 软件列表` : '📦 软件管理' }}</h2>
          <p v-if="category" class="page-desc">该页面下所有软件的统一管理</p>
          <p v-else class="page-desc">查看与管理所有已添加的软件</p>
        </div>
        <NButton type="primary" size="large" @click="router.push(categoryId ? `/admin/projects/new?categoryId=${categoryId}` : '/admin/projects/new')">
          ➕ 新增软件
        </NButton>
      </div>

      <div class="content-card">
        <div class="toolbar">
          <NInput v-model:value="keyword" placeholder="🔍 搜索名称 / slug / 仓库" clearable class="search-input" />
          <span class="count">{{ filteredList.length }} 个{{ categoryId ? '' : ` / 共 ${projects.projects.length}` }}</span>
        </div>

        <NDataTable
          :columns="columns"
          :data="filteredList"
          :row-key="(row: Project) => row.id"
          :bordered="false"
          :single-line="false"
          size="medium"
          striped
        />
      </div>
    </div>
  </AdminLayout>
</template>

<style scoped>
.list-page { display: flex; flex-direction: column; gap: 16px; flex: 1; min-height: 0; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; }
.header-left { flex: 1; min-width: 0; }
.page-title { margin: 0; font-size: 1.4rem; font-weight: 700; color: var(--text-main); }
.page-desc { margin: 4px 0 0; font-size: 0.88rem; color: var(--text-tertiary); }
.back-link {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 12px;
  border-radius: var(--radius-full);
  background: var(--color-card-soft);
  border: 1px solid var(--border-color);
  font-size: 0.82rem;
  color: var(--text-sec);
  cursor: pointer;
  margin-bottom: 8px;
  transition: background 0.18s;
}
.back-link:hover { background: var(--color-bg); }

.content-card {
  background: var(--color-card);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 20px;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.search-input { width: 300px; }
.count {
  font-size: 0.85rem;
  color: var(--text-tertiary);
  margin-left: auto;
  font-weight: 500;
}

:deep(.name-cell) {
  display: flex;
  align-items: center;
  gap: 10px;
}
:deep(.name-logo) {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  object-fit: cover;
  background: var(--color-card-soft);
}
:deep(.name-info) { display: flex; flex-direction: column; }
:deep(.name-text) { font-weight: 600; color: var(--text-main); }
:deep(.name-slug) { font-size: 0.75rem; color: var(--text-tertiary); font-family: var(--font-mono); }

@media (max-width: 768px) {
  .search-input { width: 100%; }
  .page-header { flex-direction: column; align-items: stretch; }
  .page-header :deep(.n-button) { width: 100%; }
}
</style>
