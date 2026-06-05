<script setup lang="ts">
import { ref, computed, onMounted, h } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { NButton, NInput, NDataTable, NSpace, NPopconfirm, NModal, NForm, NFormItem } from 'naive-ui'
import { useProjectStore } from '../../store/project'
import type { Version, Download } from '../../types'
import { uid, fmtDate } from '../../utils'
import AdminLayout from '../../components/admin/AdminLayout.vue'

const router = useRouter()
const route = useRoute()
const projects = useProjectStore()
const project = computed(() => projects.projects.find((p) => p.id === route.params.id))
const versions = computed(() => project.value?.versions ?? [])

const showModal = ref(false)
const editingVersion = ref<Version | null>(null)
const versionForm = ref({ version: '', changelog: '', publishedAt: '' })
const downloadList = ref<Download[]>([])

function openNew() {
  editingVersion.value = null
  versionForm.value = { version: '', changelog: '', publishedAt: new Date().toISOString().slice(0, 10) }
  downloadList.value = []
  showModal.value = true
}
function openEdit(v: Version) {
  editingVersion.value = v
  versionForm.value = { version: v.version, changelog: v.changelog, publishedAt: v.publishedAt.slice(0, 10) }
  downloadList.value = [...v.downloads]
  showModal.value = true
}
function addDownload() {
  downloadList.value.push({ platform: 'Android', filename: '', size: '', url: '' })
}
function removeDownload(idx: number) { downloadList.value.splice(idx, 1) }

function doSaveVersion() {
  if (!project.value) return
  const v: Version = {
    id: editingVersion.value?.id || uid(),
    version: versionForm.value.version,
    publishedAt: new Date(versionForm.value.publishedAt).toISOString(),
    changelog: versionForm.value.changelog,
    downloads: downloadList.value.filter((d) => d.url && d.filename),
  }
  if (editingVersion.value) {
    const idx = project.value.versions.findIndex((x) => x.id === v.id)
    if (idx >= 0) project.value.versions[idx] = v
  } else {
    project.value.versions.unshift(v)
  }
  if (project.value.versions.length > 0) {
    project.value.latestVersion = project.value.versions[0].version
    project.value.latestUpdateTime = project.value.versions[0].publishedAt
  }
  projects.save(project.value)
  showModal.value = false
}
function doDeleteVersion(id: string) {
  if (!project.value) return
  projects.removeVersion(project.value.id, id)
}

const columns = [
  {
    title: '版本号', key: 'version', width: 130,
    render: (row: Version) => h('span', { class: 'version-badge' }, row.version),
  },
  {
    title: '发布日期', key: 'publishedAt', width: 130,
    render: (row: Version) => fmtDate(row.publishedAt),
  },
  {
    title: '下载项数', key: 'downloadCount', width: 100,
    render: (row: Version) => h('span', { class: 'count-pill' }, `${row.downloads.length} 个`),
  },
  {
    title: '操作', key: 'actions', width: 180,
    render: (row: Version) => h(NSpace, { size: 'small' }, () => [
      h(NButton, { size: 'small', type: 'primary', onClick: () => openEdit(row) }, () => '编辑'),
      h(NPopconfirm, { positiveText: '确认', negativeText: '取消', onPositiveClick: () => doDeleteVersion(row.id) }, {
        default: () => '确定删除此版本？',
        trigger: () => h(NButton, { size: 'small', type: 'error', tertiary: true }, () => '删除'),
      }),
    ]),
  },
]

onMounted(() => { projects.refresh() })
</script>

<template>
  <AdminLayout>
    <div class="list-page">
      <div class="page-header">
        <div>
          <h2 class="page-title">📋 版本管理</h2>
          <p v-if="project" class="page-desc">项目: {{ project.name }}</p>
        </div>
        <div class="header-actions">
          <button class="btn-secondary" @click="router.push('/admin/projects')">返回列表</button>
          <button class="btn-primary" @click="openNew">➕ 新增版本</button>
        </div>
      </div>

      <div class="content-card">
        <template v-if="versions.length">
          <NDataTable
            :columns="columns"
            :data="versions"
            :row-key="(row: Version) => row.id"
            :bordered="false"
            size="medium"
            striped
          />
        </template>
        <div v-else class="empty-state">
          <div class="empty-icon">📋</div>
          <p>暂无版本</p>
          <button class="btn-primary" @click="openNew">添加第一个版本</button>
        </div>
      </div>
    </div>

    <NModal v-model:show="showModal" preset="card" :title="editingVersion ? '编辑版本' : '新增版本'" style="max-width: 640px; border-radius: var(--radius-lg);">
      <NForm :model="versionForm" label-placement="top">
        <div class="form-grid">
          <NFormItem label="版本号">
            <NInput v-model:value="versionForm.version" placeholder="如: v3.26.11" />
          </NFormItem>
          <NFormItem label="发布日期">
            <NInput v-model:value="versionForm.publishedAt" :input-props="{ type: 'date' }" />
          </NFormItem>
        </div>
        <NFormItem label="更新日志">
          <NInput v-model:value="versionForm.changelog" type="textarea" rows="4" placeholder="更新内容..." />
        </NFormItem>
      </NForm>

      <div class="dl-section">
        <h4 class="dl-title">下载文件</h4>
        <div v-for="(dl, idx) in downloadList" :key="idx" class="dl-row">
          <NInput v-model:value="dl.filename" placeholder="文件名" size="small" />
          <NInput v-model:value="dl.size" placeholder="大小" size="small" style="width: 100px" />
          <NInput v-model:value="dl.url" placeholder="下载 URL" size="small" />
          <button class="btn-icon" @click="removeDownload(idx)">×</button>
        </div>
        <button class="btn-secondary dl-add" @click="addDownload">+ 添加下载文件</button>
      </div>

      <template #footer>
        <NSpace justify="end">
          <NButton @click="showModal = false">取消</NButton>
          <NButton type="primary" @click="doSaveVersion">保存</NButton>
        </NSpace>
      </template>
    </NModal>
  </AdminLayout>
</template>

<style scoped>
.list-page { display: flex; flex-direction: column; gap: 16px; flex: 1; min-height: 0; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; }
.page-title { margin: 0; font-size: 1.4rem; font-weight: 700; color: var(--text-main); }
.page-desc { margin: 4px 0 0; font-size: 0.88rem; color: var(--text-tertiary); }
.header-actions { display: flex; gap: 8px; }
.content-card {
  background: var(--color-card);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 20px;
  flex: 1;
  min-height: 0;
}
.empty-state { text-align: center; padding: 60px 20px; }
.empty-icon { font-size: 3rem; margin-bottom: 12px; opacity: 0.5; }
.empty-state p { color: var(--text-tertiary); margin: 0 0 16px; }

:deep(.version-badge) {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: var(--radius-full);
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-weight: 600;
  font-size: 0.85rem;
  font-family: var(--font-mono);
}
:deep(.count-pill) {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: var(--radius-full);
  background: var(--color-card-soft);
  color: var(--text-sec);
  font-size: 0.8rem;
}

.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.dl-section { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-soft); }
.dl-title { font-size: 0.95rem; font-weight: 700; margin: 0 0 10px; color: var(--text-main); }
.dl-row { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; }
.dl-add { margin-top: 4px; }
.btn-icon {
  width: 28px; height: 28px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  background: var(--color-card);
  color: var(--text-sec);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  transition: background 0.18s, color 0.18s, border-color 0.18s;
}
.btn-icon:hover { background: rgba(255, 107, 107, 0.08); color: var(--color-error); border-color: var(--color-error); }

@media (max-width: 768px) {
  .form-grid { grid-template-columns: 1fr; }
  .header-actions { width: 100%; }
  .header-actions .btn-primary, .header-actions .btn-secondary { flex: 1; }
  .dl-row { flex-wrap: wrap; }
  .dl-row :deep(.n-input) { min-width: 100px; }
}
</style>
