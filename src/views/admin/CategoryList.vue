<script setup lang="ts">
import { ref, onMounted, h } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NInput, NDataTable, NSpace, NPopconfirm, NModal, NForm, NFormItem, NInputNumber, useMessage } from 'naive-ui'
import { useCategoryStore } from '../../store/category'
import { useProjectStore } from '../../store/project'
import type { Category } from '../../types'
import AdminLayout from '../../components/admin/AdminLayout.vue'

const router = useRouter()
const message = useMessage()
const catStore = useCategoryStore()
const projStore = useProjectStore()

const showModal = ref(false)
const editingCat = ref<Category | null>(null)
const form = ref({ name: '', slug: '', icon: '', description: '', sortOrder: 0 })

function projectCount(catId: string) {
  return projStore.projects.filter((p) => p.categoryId === catId).length
}

function openNew() {
  editingCat.value = null
  form.value = { name: '', slug: '', icon: '', description: '', sortOrder: catStore.categories.length }
  showModal.value = true
}

function openEdit(c: Category) {
  editingCat.value = c
  form.value = { name: c.name, slug: c.slug, icon: c.icon || '', description: c.description || '', sortOrder: c.sortOrder ?? 0 }
  showModal.value = true
}

function doSave() {
  if (!form.value.name.trim() || !form.value.slug.trim()) {
    message.error('名称和 Slug 不能为空')
    return
  }
  if (editingCat.value) {
    const cat = { ...editingCat.value, ...form.value, description: form.value.description.trim() || undefined }
    catStore.save(cat)
  } else {
    catStore.create(form.value.name.trim(), form.value.slug.trim(), form.value.icon || undefined, form.value.description.trim() || undefined)
  }
  showModal.value = false
  message.success('保存成功')
}

function doDelete(id: string) {
  const count = projectCount(id)
  if (count > 0 && !confirm(`此页面下有 ${count} 个关联软件，确定要删除吗？（软件不会丢失，但将无法从页面访问）`)) return
  catStore.remove(id)
  message.success('已删除')
}

const pageColumns = [
  { title: '排序', key: 'sortOrder', width: 70, render: (row: Category) => h('span', { class: 'order-num' }, row.sortOrder ?? 0) },
  { title: '图标', key: 'icon', width: 70, render: (row: Category) => h('span', { class: 'cat-icon-cell' }, row.icon || '📦') },
  {
    title: '名称', key: 'name', width: 160,
    render(row: Category) {
      return h('a', {
        class: 'cat-name-link',
        onClick: () => router.push(`/admin/categories/${row.id}/projects`),
      }, row.name)
    },
  },
  { title: 'Slug', key: 'slug', width: 110, render: (row: Category) => h('code', { class: 'slug-code' }, row.slug) },
  { title: '描述', key: 'description', ellipsis: { tooltip: true }, render: (row: Category) => row.description || '—' },
  { title: '软件数', key: 'projectCount', width: 80, render: (row: Category) => h('span', { class: 'count-badge' }, projectCount(row.id)) },
  {
    title: '操作', key: 'actions', width: 160,
    render(row: Category) {
      return h(NSpace, { size: 'small' }, () => [
        h(NButton, { size: 'small', type: 'primary', onClick: () => openEdit(row) }, () => '编辑'),
        h(NPopconfirm, { positiveText: '确认', negativeText: '取消', onPositiveClick: () => doDelete(row.id) }, {
          default: () => '确定删除此页面？',
          trigger: () => h(NButton, { size: 'small', type: 'error', tertiary: true }, () => '删除'),
        }),
      ])
    },
  },
]

onMounted(() => {
  catStore.refresh()
  projStore.refresh()
})
</script>

<template>
  <AdminLayout>
    <div class="list-page">
      <div class="page-header">
        <div>
          <h2 class="page-title">📂 页面管理</h2>
          <p class="page-desc">前台页面的统一管理</p>
        </div>
        <NButton type="primary" size="large" @click="openNew">➕ 新增页面</NButton>
      </div>

      <div class="content-card">
        <NDataTable
          :columns="pageColumns"
          :data="catStore.categories"
          :row-key="(row: Category) => row.id"
          :bordered="false"
          size="medium"
          striped
        />
      </div>
    </div>

    <NModal v-model:show="showModal" preset="card" :title="editingCat ? '编辑页面' : '新增页面'" style="max-width: 520px; border-radius: var(--radius-lg);">
      <NForm :model="form" label-placement="top">
        <NFormItem label="名称" required>
          <NInput v-model:value="form.name" placeholder="如: 阅读工具" />
        </NFormItem>
        <NFormItem label="Slug（URL 标识）" required>
          <NInput v-model:value="form.slug" placeholder="如: reader" />
        </NFormItem>
        <NFormItem label="图标（Emoji）">
          <NInput v-model:value="form.icon" placeholder="如: 📖" />
        </NFormItem>
        <NFormItem label="描述">
          <NInput v-model:value="form.description" type="textarea" rows="2" placeholder="此页面聚合了哪些软件..." />
        </NFormItem>
        <NFormItem label="排序">
          <NInputNumber v-model:value="form.sortOrder" :min="0" style="width: 100%" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showModal = false">取消</NButton>
          <NButton type="primary" @click="doSave">保存</NButton>
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
.content-card {
  background: var(--color-card);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 20px;
  flex: 1;
  min-height: 0;
}

:deep(.order-num) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--color-card-soft);
  color: var(--text-sec);
  font-weight: 600;
  font-size: 0.85rem;
}
:deep(.cat-icon-cell) { font-size: 1.2rem; }
:deep(.cat-name-link) {
  color: var(--color-primary);
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
}
:deep(.cat-name-link):hover { text-decoration: underline; }
:deep(.slug-code) {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  background: var(--color-card-soft);
  padding: 2px 8px;
  border-radius: 4px;
  color: var(--color-primary);
}
:deep(.count-badge) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 24px;
  padding: 0 8px;
  border-radius: var(--radius-full);
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-weight: 600;
  font-size: 0.78rem;
}

@media (max-width: 768px) {
  .page-header { flex-direction: column; align-items: stretch; }
  .page-header :deep(.n-button) { width: 100%; }
}
</style>
