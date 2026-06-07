<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { NInput, NInputNumber, NModal, NForm, NFormItem, NSwitch, NCheckbox, useMessage } from 'naive-ui'
import { useCategoryStore } from '../../store/category'
import { useProjectStore } from '../../store/project'
import { refreshEnabledState } from '../../composables/useEnabled'
import { emojiLibrary } from '../../utils/emojiLibrary'
import type { Category } from '../../types'
import AdminLayout from '../../components/admin/AdminLayout.vue'
import AdminSearchBar from '../../components/admin/AdminSearchBar.vue'
import AdminSortGroup, { type SortOption } from '../../components/admin/AdminSortGroup.vue'
import AdminPager from '../../components/admin/AdminPager.vue'

const router = useRouter()
const message = useMessage()
const catStore = useCategoryStore()
const projStore = useProjectStore()

const showModal = ref(false)
const editingCat = ref<Category | null>(null)
const form = ref({ name: '', slug: '', icon: '', description: '', sortOrder: 0 })

/* 搜索关键词 */
const keyword = ref('')

/* 批量选中 */
const selectedIds = ref<Set<string>>(new Set())

/* 分页 */
const page = ref(1)
const pageSize = 12

/* 排序 */
type SortBy = 'order' | 'name' | 'count'
type SortOrder = 'asc' | 'desc'
const sortBy = ref<SortBy>('order')
const sortOrder = ref<SortOrder>('asc')
function setSort(by: SortBy) {
  if (sortBy.value === by) sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc'
  else { sortBy.value = by; sortOrder.value = 'asc' }
}
const sortOptions: SortOption[] = [
  { key: 'order', label: '顺序', icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="13" y2="6"/><line x1="3" y1="12" x2="9" y2="12"/><line x1="3" y1="18" x2="11" y2="18"/><polyline points="16 8 20 4 16 4"/><line x1="20" y1="4" x2="20" y2="14"/></svg>', defaultOrder: 'asc' },
  { key: 'name', label: '名称', icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h13M3 12h9M3 18h5M17 10v10M17 10l-3 3M17 10l3 3"/></svg>', defaultOrder: 'asc' },
  { key: 'count', label: '项目数', icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>', defaultOrder: 'desc' },
]

/* 状态开关：localStorage 持久化，键 'sh_page_disabled' */
const DISABLED_KEY = 'sh_page_disabled'
const disabledIds = ref<Set<string>>(new Set(JSON.parse(localStorage.getItem(DISABLED_KEY) || '[]')))
function toggleEnabled(id: string) {
  if (disabledIds.value.has(id)) disabledIds.value.delete(id)
  else disabledIds.value.add(id)
  localStorage.setItem(DISABLED_KEY, JSON.stringify([...disabledIds.value]))
  refreshEnabledState()
}
function isEnabled(id: string) { return !disabledIds.value.has(id) }

/* 派生：每个页面的项目数 */
function projectCount(catSlug: string) {
  return projStore.software.filter((p) => p.categorySlug === catSlug).length
}

/* 过滤后的列表 */
const filteredCats = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  let list = catStore.categories
  if (kw) {
    list = list.filter((c) =>
      c.name.toLowerCase().includes(kw) ||
      c.slug.toLowerCase().includes(kw) ||
      (c.description || '').toLowerCase().includes(kw) ||
      (c.icon || '').toLowerCase().includes(kw)
    )
  }
  return list
})
const sortedCats = computed(() => {
  const list = [...filteredCats.value]
  list.sort((a, b) => {
    let cmp = 0
    if (sortBy.value === 'order') cmp = (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
    else if (sortBy.value === 'name') cmp = a.name.localeCompare(b.name, 'zh-Hans-CN')
    else if (sortBy.value === 'count') cmp = projectCount(a.slug) - projectCount(b.slug)
    return sortOrder.value === 'desc' ? -cmp : cmp
  })
  return list
})

const totalPages = computed(() => Math.max(1, Math.ceil(sortedCats.value.length / pageSize)))
const pagedCats = computed(() => {
  const start = (page.value - 1) * pageSize
  return sortedCats.value.slice(start, start + pageSize)
})
function jumpPage(p: number) {
  if (p < 1 || p > totalPages.value) return
  page.value = p
}

const allSelected = computed(() => pagedCats.value.length > 0 && pagedCats.value.every((c) => selectedIds.value.has(c.id)))
const someSelected = computed(() => pagedCats.value.some((c) => selectedIds.value.has(c.id)) && !allSelected.value)
function toggleSelectAll() {
  if (allSelected.value) {
    pagedCats.value.forEach((c) => selectedIds.value.delete(c.id))
  } else {
    pagedCats.value.forEach((c) => selectedIds.value.add(c.id))
  }
}
function toggleSelectOne(id: string) {
  if (selectedIds.value.has(id)) selectedIds.value.delete(id)
  else selectedIds.value.add(id)
}
function clearSelection() {
  selectedIds.value.clear()
}

const showBulkDeleteModal = ref(false)
const showSingleDeleteModal = ref(false)
const deletingCat = ref<Category | null>(null)
const bulkDeleteInfo = computed(() => {
  if (selectedIds.value.size === 0) return { ids: [], withProjects: 0, msg: '' }
  const ids = [...selectedIds.value]
  const withProjects = ids.filter((id) => {
    const cat = catStore.categories.find((c) => c.id === id)
    return cat ? projectCount(cat.slug) > 0 : false
  })
  const msg = withProjects.length > 0
    ? `其中 ${withProjects.length} 个页面下有关联软件，软件不会被删除，但将无法从这些页面访问。`
    : ''
  return { ids, withProjects: withProjects.length, msg }
})
function confirmBulkDelete() {
  const { ids } = bulkDeleteInfo.value
  ids.forEach((id) => catStore.remove(id))
  message.success(`已删除 ${ids.length} 个页面`)
  clearSelection()
  showBulkDeleteModal.value = false
}
function bulkEnable(enable: boolean) {
  selectedIds.value.forEach((id) => {
    if (enable) disabledIds.value.delete(id)
    else disabledIds.value.add(id)
  })
  localStorage.setItem(DISABLED_KEY, JSON.stringify([...disabledIds.value]))
  refreshEnabledState()
  message.success(enable ? `已启用 ${selectedIds.value.size} 个页面` : `已禁用 ${selectedIds.value.size} 个页面`)
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

/* Emoji 选择器 */
const activeEmojiCat = ref(0)
function pickEmoji(e: string) {
  form.value.icon = e
}

function confirmDelete() {
  if (!deletingCat.value) return
  catStore.remove(deletingCat.value.id)
  message.success('已删除')
  showSingleDeleteModal.value = false
  deletingCat.value = null
}

function preview(c: Category) {
  window.open(`/category/${c.slug}`, '_blank')
}

/* 智能分页：已移至 AdminPager 组件 */

watch(sortBy, () => { page.value = 1 })

onMounted(() => {
  catStore.refresh()
  projStore.refresh()
})
</script>

<template>
  <AdminLayout>
    <div class="pages-page">
      <!-- 顶部操作区 -->
      <header class="page-head">
        <div>
          <h2 class="page-title"><span class="page-title-emoji">📂</span>页面管理</h2>
          <p class="page-desc">前台页面的统一管理 · 共 {{ catStore.categories.length }} 个页面</p>
        </div>
        <div class="head-actions">
          <AdminSearchBar
            v-model="keyword"
            placeholder="搜索页面名称 / 路径 / 标签..."
            width="320px"
          />
          <AdminSortGroup
            :sort-key="sortBy"
            :sort-order="sortOrder"
            :options="sortOptions"
            @update="(p) => { sortBy = p.key as SortBy; sortOrder = p.order }"
          />
          <button class="btn-primary btn-add" @click="openNew">
            <span class="add-icon">＋</span>
            新增页面
          </button>
        </div>
      </header>

      <!-- 批量操作条 -->
      <transition name="bulk-bar">
        <div v-if="selectedIds.size > 0" class="bulk-bar">
          <div class="bulk-info">
            <span class="bulk-count">{{ selectedIds.size }}</span>
            <span>个页面已选中</span>
          </div>
          <div class="bulk-actions">
            <button class="btn-ghost" @click="bulkEnable(true)">✓ 批量启用</button>
            <button class="btn-ghost" @click="bulkEnable(false)">⏸ 批量禁用</button>
            <button class="btn-ghost bulk-danger" @click="showBulkDeleteModal = true">🗑 批量删除</button>
            <button class="btn-ghost" @click="clearSelection">取消</button>
          </div>
        </div>
      </transition>

      <!-- 列表 -->
      <div v-if="catStore.categories.length === 0" class="empty-state">
        <div class="empty-icon">📂</div>
        <p>还没有任何页面，点击右上角"新增页面"开始创建</p>
      </div>
      <div v-else-if="pagedCats.length === 0" class="empty-state">
        <div class="empty-icon">🔍</div>
        <p>没有匹配 "{{ keyword }}" 的页面</p>
      </div>
      <div v-else class="page-grid">
        <article
          v-for="c in pagedCats"
          :key="c.id"
          :class="['page-card', { disabled: !isEnabled(c.id) }]"
        >
          <!-- 顶部：复选框 + 排序 + 类型标签 -->
          <div class="pc-top">
            <NCheckbox
              :checked="selectedIds.has(c.id)"
              @update:checked="toggleSelectOne(c.id)"
            />
            <span class="order-num">{{ c.sortOrder ?? 0 }}</span>
            <span :class="['type-tag', projectCount(c.slug) > 0 ? 'type-dynamic' : 'type-static']">
              <span class="type-dot"></span>
              {{ projectCount(c.slug) > 0 ? '动态' : '静态' }}
            </span>
          </div>

          <!-- 中部：图标 + 名称 + 路径 -->
          <div class="pc-mid">
            <div class="pc-icon">{{ c.icon || '📦' }}</div>
            <div class="pc-info">
              <h3 class="pc-name" @click="router.push(`/admin/categories/${c.id}/projects`)">{{ c.name }}</h3>
              <div class="pc-slug-row">
                <code class="pc-slug">/category/{{ c.slug }}</code>
              </div>
              <p v-if="c.description" class="pc-desc" :title="c.description">{{ c.description }}</p>
              <p v-else class="pc-desc pc-desc-empty">暂无描述</p>
            </div>
          </div>

          <!-- 底部：项目数 + 状态开关 + 操作 -->
          <footer class="pc-foot">
            <div class="pc-meta">
              <span class="meta-item">
                <span class="meta-icon">📦</span>
                <span class="meta-val">{{ projectCount(c.slug) }}</span>
                <span class="meta-label">个软件</span>
              </span>
              <span class="meta-item">
                <span class="meta-icon">📅</span>
                <span class="meta-label">创建于近期</span>
              </span>
            </div>
            <div class="pc-status">
              <span class="status-text">{{ isEnabled(c.id) ? '已启用' : '已禁用' }}</span>
              <NSwitch
                :value="isEnabled(c.id)"
                size="small"
                @update:value="toggleEnabled(c.id)"
              />
            </div>
          </footer>

          <div class="pc-actions">
            <button class="pc-btn" title="预览前台" @click="preview(c)">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/>
              </svg>
              预览
            </button>
            <button class="pc-btn" title="管理软件" @click="router.push(`/admin/categories/${c.id}/projects`)">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
              软件
            </button>
            <button class="pc-btn" title="编辑" @click="openEdit(c)">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
              </svg>
              编辑
            </button>
            <button class="pc-btn pc-btn-danger" title="删除" @click="deletingCat = c; showSingleDeleteModal = true">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
              </svg>
              删除
            </button>
          </div>
        </article>
      </div>

      <!-- 分页 -->
      <AdminPager
        :page="page"
        :total-pages="totalPages"
        :total="sortedCats.length"
        item-name="个"
        @update:page="jumpPage"
      />
    </div>

    <!-- 单删确认弹窗 -->
    <NModal v-model:show="showSingleDeleteModal" preset="card" title="删除页面" style="max-width: 420px; border-radius: var(--admin-radius-card);" :mask-closable="false">
      <div class="bulk-modal-body">
        <div class="bulk-modal-icon">🗑</div>
        <p class="bulk-modal-title">确定要删除页面 <strong>{{ deletingCat?.name }}</strong> 吗？</p>
        <p v-if="deletingCat && projectCount(deletingCat.slug) > 0" class="bulk-modal-warn">
          此页面下有 {{ projectCount(deletingCat.slug) }} 个关联软件，软件不会被删除，但将无法从此页面访问。
        </p>
      </div>
      <template #footer>
        <div class="bulk-modal-footer">
          <button class="btn-secondary" @click="showSingleDeleteModal = false">取消</button>
          <button class="btn-danger" @click="confirmDelete">确认删除</button>
        </div>
      </template>
    </NModal>

    <!-- 批量删除确认弹窗 -->
    <NModal v-model:show="showBulkDeleteModal" preset="card" title="批量删除页面" style="max-width: 460px; border-radius: var(--admin-radius-card);" :mask-closable="false">
      <div class="bulk-modal-body">
        <div class="bulk-modal-icon">🗑</div>
        <p class="bulk-modal-title">确定要删除选中的 <strong>{{ bulkDeleteInfo.ids.length }}</strong> 个页面吗？</p>
        <p v-if="bulkDeleteInfo.msg" class="bulk-modal-warn">{{ bulkDeleteInfo.msg }}</p>
      </div>
      <template #footer>
        <div class="bulk-modal-footer">
          <button class="btn-secondary" @click="showBulkDeleteModal = false">取消</button>
          <button class="btn-danger" @click="confirmBulkDelete">确认删除</button>
        </div>
      </template>
    </NModal>

    <!-- 新增/编辑弹窗 -->
    <NModal v-model:show="showModal" preset="card" :title="editingCat ? '编辑页面' : '新增页面'" style="max-width: 620px; border-radius: var(--admin-radius-card);">
      <NForm :model="form" label-placement="top">
        <NFormItem label="名称" required>
          <NInput v-model:value="form.name" placeholder="如: 阅读工具" size="large" />
        </NFormItem>
        <NFormItem label="Slug（URL 标识）" required>
          <NInput v-model:value="form.slug" placeholder="如: reader" size="large" />
        </NFormItem>
        <NFormItem label="图标（Emoji）">
          <NInput v-model:value="form.icon" placeholder="如: 📖 或在下方选择" size="large" />
        </NFormItem>

        <div class="emoji-picker">
          <div class="emoji-picker-tabs">
            <button
              v-for="(cat, i) in emojiLibrary"
              :key="cat.name"
              :class="['emoji-tab', { active: activeEmojiCat === i }]"
              @click="activeEmojiCat = i"
              type="button"
            >
              <span class="emoji-tab-icon">{{ cat.icon }}</span>
              <span class="emoji-tab-name">{{ cat.name }}</span>
            </button>
          </div>
          <div class="emoji-picker-grid">
            <button
              v-for="e in emojiLibrary[activeEmojiCat].emojis"
              :key="e"
              :class="['emoji-cell', { active: form.icon === e }]"
              type="button"
              @click="pickEmoji(e)"
            >{{ e }}</button>
          </div>
        </div>

        <NFormItem label="描述" style="margin-top: 16px;">
          <NInput v-model:value="form.description" type="textarea" rows="2" placeholder="此页面聚合了哪些软件..." />
        </NFormItem>
        <NFormItem label="排序">
          <NInputNumber v-model:value="form.sortOrder" :min="0" style="width: 100%" size="large" />
        </NFormItem>
      </NForm>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button class="btn-secondary" @click="showModal = false">取消</button>
          <button class="btn-primary" @click="doSave">保存</button>
        </div>
      </template>
    </NModal>
  </AdminLayout>
</template>

<style scoped>
.pages-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  flex: 1;
  min-height: 0;
  padding-left: 25px;
  margin-right: -3px;
}

/* === 顶部操作区 === */
.head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.btn-add {
  height: 48px;
  padding: 0 24px;
  font-size: 1rem;
  font-weight: 700;
  gap: 6px;
}
.add-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.25);
  font-size: 0.95rem;
  font-weight: 800;
}

/* === 批量操作条 === */
.bulk-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 20px;
  background: linear-gradient(135deg, rgba(79, 140, 255, 0.08), rgba(140, 108, 255, 0.08));
  border: 1px solid rgba(79, 140, 255, 0.22);
  border-radius: 18px;
  box-shadow: 0 4px 20px rgba(79, 140, 255, 0.08);
}
.bulk-info { display: flex; align-items: center; gap: 6px; font-size: 0.9rem; color: var(--text-sec); }
.bulk-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  padding: 0 8px;
  border-radius: var(--radius-full);
  background: var(--admin-gradient);
  color: #FFFFFF;
  font-weight: 700;
  font-size: 0.82rem;
}
.bulk-actions { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.bulk-danger:hover { color: #E55353 !important; background: rgba(229, 83, 83, 0.1) !important; }
.bulk-bar-enter-active, .bulk-bar-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.bulk-bar-enter-from, .bulk-bar-leave-to { opacity: 0; transform: translateY(-4px); }

/* === 卡片网格 === */
.page-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}
.page-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 20px;
  background: var(--admin-card);
  border: 1px solid var(--admin-border);
  border-radius: var(--admin-radius-card);
  box-shadow: var(--admin-shadow-card);
  transition: transform 0.25s ease, box-shadow 0.25s ease, opacity 0.2s ease;
  position: relative;
  overflow: hidden;
}
.page-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--admin-shadow-card-hover);
}
.page-card.disabled { opacity: 0.6; }
.page-card.disabled::before {
  content: '';
  position: absolute;
  top: 12px; right: -36px;
  width: 120px;
  text-align: center;
  background: var(--text-tertiary);
  color: #FFFFFF;
  font-size: 0.65rem;
  font-weight: 600;
  padding: 2px 0;
  transform: rotate(35deg);
  z-index: 1;
}

/* 卡片顶部 */
.pc-top {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
  z-index: 2;
}
.order-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  padding: 0 6px;
  border-radius: var(--radius-full);
  background: var(--color-card-soft);
  color: var(--text-sec);
  font-weight: 600;
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
}
.type-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  padding: 0 10px;
  border-radius: var(--radius-full);
  font-size: 0.72rem;
  font-weight: 600;
  margin-left: auto;
}
.type-tag .type-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
}
.type-dynamic {
  background: linear-gradient(135deg, rgba(79, 140, 255, 0.12), rgba(52, 120, 246, 0.12));
  color: #2563EB;
}
.type-dynamic .type-dot { background: #3478F6; }
.type-static {
  background: linear-gradient(135deg, rgba(140, 108, 255, 0.12), rgba(140, 108, 255, 0.12));
  color: #6D4FD6;
}
.type-static .type-dot { background: #8C6CFF; }

/* 卡片中部 */
.pc-mid {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}
.pc-icon {
  width: 52px; height: 52px;
  border-radius: 16px;
  background: var(--admin-gradient);
  display: flex; align-items: center; justify-content: center;
  font-size: 1.7rem;
  flex-shrink: 0;
  color: #FFFFFF;
  box-shadow: 0 6px 20px rgba(79, 140, 255, 0.28);
}
.pc-info { flex: 1; min-width: 0; }
.pc-name {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0 0 4px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.18s ease;
}
.pc-name:hover { color: var(--color-primary); }
.pc-slug-row { margin-bottom: 6px; }
.pc-slug {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  background: var(--color-card-soft);
  padding: 2px 8px;
  border-radius: 6px;
  color: var(--color-primary);
  display: inline-block;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: middle;
}
.pc-desc {
  font-size: 0.82rem;
  color: var(--text-sec);
  line-height: 1.5;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.pc-desc-empty { color: var(--text-tertiary); font-style: italic; }

/* 卡片底部 */
.pc-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px dashed var(--admin-border);
}
.pc-meta { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.meta-item { display: inline-flex; align-items: center; gap: 4px; font-size: 0.78rem; color: var(--text-tertiary); }
.meta-icon { font-size: 0.85rem; }
.meta-val { font-weight: 700; color: var(--text-main); font-variant-numeric: tabular-nums; }
.meta-label { color: var(--text-tertiary); }
.pc-status { display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0; }
.status-text {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-sec);
}

/* 操作按钮 */
.pc-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.pc-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 32px;
  padding: 0 10px;
  background: var(--color-card-soft);
  color: var(--text-sec);
  border: 1px solid var(--admin-border);
  border-radius: 10px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.18s, color 0.18s, transform 0.18s, border-color 0.18s;
}
.pc-btn:hover {
  background: var(--color-primary-soft);
  color: var(--color-primary);
  border-color: var(--color-primary-soft);
  transform: scale(1.04);
}
.pc-btn-danger:hover {
  background: rgba(229, 83, 83, 0.1);
  color: #E55353;
  border-color: rgba(229, 83, 83, 0.2);
}
.pc-btn svg { display: block; }

/* === 空状态 === */
.empty-state {
  text-align: center;
  padding: 80px 20px;
  color: var(--text-tertiary);
  font-size: 0.95rem;
  background: var(--admin-card);
  border: 1px dashed var(--admin-border);
  border-radius: var(--admin-radius-card);
}
.empty-icon { font-size: 3.5rem; margin-bottom: 8px; }

/* === Emoji 选择器 === */
.emoji-picker {
  border: 1px solid var(--admin-border);
  border-radius: var(--admin-radius-card);
  background: var(--color-card-soft);
  overflow: hidden;
}
.emoji-picker-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 8px;
  background: var(--admin-card);
  border-bottom: 1px solid var(--admin-border);
}
.emoji-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border: 1px solid transparent;
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--text-sec);
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}
.emoji-tab:hover { background: var(--color-primary-soft); color: var(--color-primary); }
.emoji-tab.active {
  background: var(--color-primary-soft);
  color: var(--color-primary);
  border-color: var(--color-primary);
}
.emoji-tab-icon { font-size: 1rem; line-height: 1; }
.emoji-picker-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 2px;
  padding: 8px;
  max-height: 220px;
  overflow-y: auto;
}
.emoji-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  padding: 0;
  font-size: 1.4rem;
  line-height: 1;
  background: transparent;
  border: 1.5px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.12s;
}
.emoji-cell:hover {
  background: var(--admin-card);
  border-color: var(--color-primary);
  transform: scale(1.15);
}
.emoji-cell.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

/* === 批量删除确认弹窗 === */
.bulk-modal-body { text-align: center; padding: 8px 0; }
.bulk-modal-icon { font-size: 2.8rem; margin-bottom: 8px; }
.bulk-modal-title { font-size: 1.05rem; color: var(--text-main); margin: 0 0 8px; line-height: 1.5; }
.bulk-modal-warn { font-size: 0.85rem; color: #E55353; margin: 0; background: rgba(229, 83, 83, 0.08); padding: 10px 14px; border-radius: 10px; line-height: 1.5; }
.bulk-modal-footer { display: flex; justify-content: center; gap: 12px; }

/* === 分页 === 已抽到 AdminPager 组件 */

@media (max-width: 1024px) {
  .page-grid { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
}
@media (max-width: 768px) {
  .page-head { flex-direction: column; align-items: stretch; }
  .head-actions { width: 100%; }
  .btn-add { flex: 1; }
  .page-grid { grid-template-columns: 1fr; }
  .pc-actions { justify-content: flex-end; }
  .pc-foot { flex-direction: column; align-items: flex-start; gap: 8px; }
  .pc-status { width: 100%; justify-content: space-between; }
  .emoji-picker-grid { grid-template-columns: repeat(6, 1fr); }
}
</style>
