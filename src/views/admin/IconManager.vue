<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { NModal, NInput, useMessage } from 'naive-ui'
import AdminLayout from '../../components/admin/AdminLayout.vue'
import AdminSearchBar from '../../components/admin/AdminSearchBar.vue'
import AdminSortGroup, { type SortOption } from '../../components/admin/AdminSortGroup.vue'
import AdminPager from '../../components/admin/AdminPager.vue'
import { useProjectStore } from '../../store/project'
import { useIconUrl } from '../../composables/useIconUrl'
import {
  listIcons, uploadIcon, deleteIcon,
  type IconListItem,
} from '../../utils/iconsApi'
import { compressImage, fmtSize } from '../../utils/imageCompressor'

const message = useMessage()
const projects = useProjectStore()
const { resolve } = useIconUrl()

/* ============== 上传 ============== */
const dragOver = ref(false)
const uploading = ref(false)
const uploadProgress = ref({ done: 0, total: 0 })
const fileInput = ref<HTMLInputElement | null>(null)
const customName = ref('')
const pendingCount = ref(0)

/** 保留 Unicode（中文等），只过滤路径分隔符 + 控制字符 + 首尾点/空格 */
function sanitizeFilename(name: string, max = 60): string {
  return name
    .replace(/[\/\\\x00-\x1f]/g, '_')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, max) || 'icon'
}

/** 根据用户输入 + 文件索引拼出最终 filename（不含时间戳后缀） */
function buildFilename(rawFilename: string, index: number, total: number): string {
  const ext = rawFilename.split('.').pop() || 'webp'
  const base = customName.value.trim()
  if (!base) return rawFilename
  const safe = sanitizeFilename(base)
  if (total <= 1) return `${safe}.${ext}`
  return `${safe}-${index}.${ext}`
}

function clearCustomName() { customName.value = '' }

/* ============== 图标库 ============== */
const icons = ref<IconListItem[]>([])
const loading = ref(false)
const keyword = ref('')
const selected = ref<Set<string>>(new Set())
const deleting = ref<Set<string>>(new Set())
const showSingleDeleteModal = ref(false)
const deletingIcon = ref<IconListItem | null>(null)
const showBatchDeleteModal = ref(false)
const totalSize = ref(0)
const page = ref(1)
const pageSize = 30
type SortBy = 'date' | 'name'
type SortOrder = 'asc' | 'desc'
const sortBy = ref<SortBy>('date')
const sortOrder = ref<SortOrder>('desc')
function setSort(by: SortBy) {
  if (sortBy.value === by) sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc'
  else { sortBy.value = by; sortOrder.value = 'desc' }
}
const sortOptions: SortOption[] = [
  { key: 'date', label: '日期', icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>', defaultOrder: 'desc' },
  { key: 'name', label: '名称', icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h13M3 12h9M3 18h5M17 10v10M17 10l-3 3M17 10l3 3"/></svg>', defaultOrder: 'asc' },
]

/* ============== 使用情况统计 ============== */
const usedByMap = computed(() => {
  const map = new Map<string, number>()
  for (const p of projects.software) {
    if (!p.logo) continue
    const fname = p.logo.split('/').pop()?.split('?')[0]?.toLowerCase()
    if (fname) map.set(fname, (map.get(fname) || 0) + 1)
  }
  return map
})

const filteredIcons = computed(() => {
  if (!keyword.value.trim()) return icons.value
  const kw = keyword.value.toLowerCase()
  return icons.value.filter((i) => i.name.toLowerCase().includes(kw))
})
const sortedIcons = computed(() => {
  const list = [...filteredIcons.value]
  list.sort((a, b) => {
    let cmp = 0
    if (sortBy.value === 'date') {
      const ta = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0
      const tb = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0
      cmp = ta - tb
    } else {
      cmp = a.name.localeCompare(b.name, 'zh-Hans-CN')
    }
    return sortOrder.value === 'desc' ? -cmp : cmp
  })
  return list
})
const totalPages = computed(() => Math.max(1, Math.ceil(sortedIcons.value.length / pageSize)))
const pagedIcons = computed(() => {
  const start = (page.value - 1) * pageSize
  return sortedIcons.value.slice(start, start + pageSize)
})
function jumpPage(p: number) {
  if (p < 1 || p > totalPages.value) return
  page.value = p
}
/* 智能分页：已抽到 AdminPager 组件 */
watch(keyword, () => { page.value = 1 })
watch(sortBy, () => { page.value = 1 })

/* ============== 生命周期 ============== */
onMounted(async () => {
  projects.refresh()
  await loadIcons()
})

async function loadIcons() {
  loading.value = true
  try {
    const r = await listIcons()
    if (r.error) {
      message.warning(r.error)
      icons.value = []
    } else {
      icons.value = r.items
      totalSize.value = r.items.reduce((s, i) => s + i.size, 0)
    }
  } catch (e: any) {
    message.error(`加载图标库失败: ${e.message}`)
    icons.value = []
  }
  loading.value = false
}

/** 后台静默同步：失败/返回旧数据也不影响 UI */
async function syncIconsInBackground() {
  try {
    const r = await listIcons()
    if (!r.error && r.items.length >= icons.value.length) {
      icons.value = r.items
      totalSize.value = r.items.reduce((s, i) => s + i.size, 0)
    }
  } catch { /* 静默 */ }
}

/* ============== 上传逻辑 ============== */
function pickFiles() { fileInput.value?.click() }

async function handleFiles(files: FileList | File[]) {
  const list = Array.from(files).filter((f) => f.type.startsWith('image/'))
  if (list.length === 0) { message.warning('未选择图片文件'); return }

  uploading.value = true
  uploadProgress.value = { done: 0, total: list.length }
  const useCustom = customName.value.trim().length > 0
  const usedNames = new Set<string>()
  let okCount = 0
  let failCount = 0

  for (let i = 0; i < list.length; i++) {
    const file = list[i]
    try {
      const compressed = await compressImage(file, { maxSize: 256, quality: 0.85 })
      const base64 = await blobToBase64(compressed.blob)
      const base = useCustom ? buildFilename(compressed.filename, i + 1, list.length) : compressed.filename
      const finalName = uniqify(base, usedNames)
      const result = await uploadIcon(finalName, base64)
      usedNames.add(finalName)
      okCount++
      const tag = result.branchCreated ? ' [新分支已创建]' : ''
      message.success(`${result.overwritten ? '已更新' : '已上传'}: ${result.name} (${fmtSize(result.size)})${tag}`)
      /* 乐观更新：把新图标直接 push 到数组，UI 立即显示 */
      const newItem: IconListItem = {
        name: result.name,
        path: result.path,
        sha: result.sha,
        size: result.size,
        rawUrl: result.rawUrl,
        downloadUrl: null,
        htmlUrl: result.commitUrl,
        uploadedAt: new Date().toISOString(),
      }
      if (result.overwritten) {
        const idx = icons.value.findIndex((i) => i.name === result.name)
        if (idx >= 0) icons.value[idx] = newItem
        else icons.value.push(newItem)
      } else {
        icons.value.push(newItem)
      }
      totalSize.value = icons.value.reduce((s, i) => s + i.size, 0)
    } catch (e: any) {
      failCount++
      message.error(`${file.name} 上传失败: ${e.message}`)
    }
    uploadProgress.value.done++
  }
  uploading.value = false
  if (okCount > 0) {
    if (useCustom) clearCustomName()
    /* 后台静默同步真实数据（不阻塞 UI，GitHub CDN 缓存可能延迟） */
    syncIconsInBackground()
  }
  if (failCount === 0) message.success(`全部 ${okCount} 个图标上传完成`)
}

function uniqify(name: string, used: Set<string>): string {
  if (!used.has(name)) return name
  const ext = name.split('.').pop() || 'webp'
  const base = name.replace(/\.[^.]+$/, '')
  for (let n = 1; ; n++) {
    const candidate = `${base}-${n}.${ext}`
    if (!used.has(candidate)) return candidate
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const r = reader.result as string
      const idx = r.indexOf(',')
      resolve(idx >= 0 ? r.slice(idx + 1) : r)
    }
    reader.onerror = () => reject(new Error('Base64 读取失败'))
    reader.readAsDataURL(blob)
  })
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  dragOver.value = false
  if (e.dataTransfer?.files) handleFiles(e.dataTransfer.files)
}
function onDragOver(e: DragEvent) { e.preventDefault(); dragOver.value = true }
function onDragLeave() { dragOver.value = false }
function onFileChange(e: Event) {
  const t = e.target as HTMLInputElement
  if (t.files) {
    pendingCount.value = t.files.length
    handleFiles(t.files)
  }
  t.value = ''
}

/* ============== 选择/删除 ============== */
function toggleSelect(name: string) {
  if (selected.value.has(name)) selected.value.delete(name)
  else selected.value.add(name)
}
function selectAll() {
  if (selected.value.size === filteredIcons.value.length) selected.value.clear()
  else for (const i of filteredIcons.value) selected.value.add(i.name)
}
async function doDelete(item: IconListItem) {
  deleting.value.add(item.name)
  /* 乐观更新：立即从数组中移除（避免选中状态被误判） */
  const snapshot = [...icons.value]
  icons.value = icons.value.filter((i) => i.name !== item.name)
  selected.value.delete(item.name)
  totalSize.value = icons.value.reduce((s, i) => s + i.size, 0)
  try {
    await deleteIcon(item.path, item.sha)
    message.success(`已删除: ${item.name}`)
    syncIconsInBackground()
  } catch (e: any) {
    /* 失败：回滚 */
    icons.value = snapshot
    totalSize.value = snapshot.reduce((s, i) => s + i.size, 0)
    message.error(`删除失败: ${e.message}`)
  }
  deleting.value.delete(item.name)
}
async function doBatchDelete() {
  const items = icons.value.filter((i) => selected.value.has(i.name))
  if (items.length === 0) return
  for (const item of items) await doDelete(item)
  selected.value.clear()
}

/* ============== URL 工具 ============== */
function iconCdnUrl(item: IconListItem): string {
  return resolve(item.rawUrl)
}

async function copyUrl(url: string) {
  try {
    await navigator.clipboard.writeText(url)
    message.success('已复制到剪贴板')
  } catch {
    message.error('复制失败，请手动复制')
  }
}
</script>

<template>
  <AdminLayout>
    <div class="icons-scroll">
      <!-- 页面头部 -->
      <div class="page-head">
        <div>
          <h2 class="page-title"><span class="page-title-emoji">🖼️</span>图标管理</h2>
          <p class="page-desc">上传、查看、管理软件图标</p>
        </div>
        <div class="head-actions">
          <button class="btn-primary" @click="loadIcons" :disabled="loading">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" :class="{ spinning: loading }">
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            刷新
          </button>
        </div>
      </div>

      <!-- 上传区 -->
      <section
        class="upload-zone"
        :class="{ active: dragOver }"
        @click="pickFiles"
        @drop="onDrop"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
      >
        <input ref="fileInput" type="file" accept="image/*" multiple style="display:none" @change="onFileChange" />
        <div class="upload-icon">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </div>
        <div class="upload-text">
          <div class="upload-title">
            <span v-if="uploading">
              上传中 {{ uploadProgress.done }} / {{ uploadProgress.total }}
            </span>
            <span v-else>拖拽图片到此处，或点击选择</span>
          </div>
          <div class="upload-desc">
            支持 PNG / JPG / SVG / GIF · 自动压缩为 256×256 WebP · 质量 0.85
          </div>
        </div>
      </section>

      <!-- 自定义文件名（可选） -->
      <div class="name-section">
        <div class="name-input-row">
          <NInput
            v-model:value="customName"
            placeholder="自定义名称（可选，留空用原文件名）"
            size="medium"
            clearable
            :disabled="uploading"
          >
            <template #prefix>📝</template>
          </NInput>
        </div>
        <span class="name-hint">📎 留空 → 使用原文件名</span>
        <span v-if="customName.trim()" class="name-preview">
          将上传为：{{ sanitizeFilename(customName) }}.webp{{ pendingCount > 1 ? '、…-' + pendingCount + '.webp' : '' }}
        </span>
      </div>

      <!-- 图标库 -->
      <section class="library-card">
        <header class="library-head">
          <div>
            <h3 class="library-title">图标库</h3>
            <p class="library-sub">{{ icons.length }} 个图标 · 共 {{ fmtSize(totalSize) }}</p>
          </div>
          <div class="library-actions">
            <AdminSearchBar
              v-model="keyword"
              placeholder="搜索文件名..."
              :height="40"
              :show-clear="false"
            />
            <AdminSortGroup
              :sort-key="sortBy"
              :sort-order="sortOrder"
              :options="sortOptions"
              :height="40"
              @update="(p) => { sortBy = p.key as SortBy; sortOrder = p.order }"
            />
            <button v-if="selected.size > 0" class="btn-danger-soft" @click="showBatchDeleteModal = true">
              删除选中 ({{ selected.size }})
            </button>
            <button v-if="sortedIcons.length > 0" class="btn-ghost" @click="selectAll">
              {{ selected.size === sortedIcons.length ? '取消全选' : '全选' }}
            </button>
          </div>
        </header>

        <div v-if="loading" class="loading-state">
          <div class="spinner"></div>
          <p>正在加载图标库...</p>
        </div>
        <div v-else-if="filteredIcons.length === 0" class="empty-state">
          <div class="empty-illust">
            <svg viewBox="0 0 120 120" width="96" height="96" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="20" y="20" width="80" height="80" rx="14" fill="rgba(52, 120, 246, 0.08)"/>
              <circle cx="44" cy="44" r="6" fill="rgba(140, 108, 255, 0.2)"/>
              <polyline points="100 100 75 75 55 95 35 75 20 90" stroke-linejoin="round"/>
            </svg>
          </div>
          <h3 class="empty-title">
            <span v-if="keyword">没有匹配 "{{ keyword }}" 的图标</span>
            <span v-else>图标库还是空的</span>
          </h3>
          <p class="empty-desc">
            <span v-if="keyword">试试调整搜索关键词</span>
            <span v-else>拖拽图片到上方上传区，或点击「上传图标」按钮</span>
          </p>
        </div>
        <div v-else class="icon-grid">
          <div
            v-for="icon in pagedIcons"
            :key="icon.name"
            class="icon-tile"
            :class="{ selected: selected.has(icon.name) }"
          >
            <div class="icon-tile-check" @click.stop="toggleSelect(icon.name)">
              <svg v-if="selected.has(icon.name)" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div class="icon-preview">
              <img :src="iconCdnUrl(icon) + `?v=${Date.now()}`" :alt="icon.name" loading="lazy" />
            </div>
            <div class="icon-meta">
              <div class="icon-name" :title="icon.name">{{ icon.name }}</div>
              <div class="icon-info">
                <span>{{ fmtSize(icon.size) }}</span>
                <span v-if="usedByMap.get(icon.name.toLowerCase())" class="usage-pill">
                  引用 {{ usedByMap.get(icon.name.toLowerCase()) }}
                </span>
              </div>
              <div class="icon-actions">
                <button class="icon-btn" @click.stop="copyUrl(iconCdnUrl(icon))" title="复制 CDN URL">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                  URL
                </button>
                <button class="icon-btn danger" :disabled="deleting.has(icon.name)" @click="deletingIcon = icon; showSingleDeleteModal = true">删除</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 分页 -->
        <AdminPager
          :page="page"
          :total-pages="totalPages"
          :total="sortedIcons.length"
          item-name="个"
          @update:page="jumpPage"
        />
      </section>
    </div>

    <!-- 单删确认弹窗 -->
    <NModal v-model:show="showSingleDeleteModal" preset="card" title="删除图标" style="max-width: 420px; border-radius: var(--admin-radius-card);" :mask-closable="false">
      <div class="del-modal-body">
        <div class="del-modal-icon">🗑</div>
        <p class="del-modal-title">确定要删除图标 <strong>{{ deletingIcon?.name }}</strong> 吗？</p>
      </div>
      <template #footer>
        <div class="del-modal-footer">
          <button class="btn-secondary" @click="showSingleDeleteModal = false">取消</button>
          <button class="btn-danger" @click="deletingIcon && doDelete(deletingIcon); showSingleDeleteModal = false">确认删除</button>
        </div>
      </template>
    </NModal>

    <!-- 批量删除确认弹窗 -->
    <NModal v-model:show="showBatchDeleteModal" preset="card" title="批量删除图标" style="max-width: 460px; border-radius: var(--admin-radius-card);" :mask-closable="false">
      <div class="del-modal-body">
        <div class="del-modal-icon">🗑</div>
        <p class="del-modal-title">确定要删除选中的 <strong>{{ selected.size }}</strong> 个图标吗？<br />此操作不可恢复。</p>
      </div>
      <template #footer>
        <div class="del-modal-footer">
          <button class="btn-secondary" @click="showBatchDeleteModal = false">取消</button>
          <button class="btn-danger" @click="doBatchDelete(); showBatchDeleteModal = false">确认删除</button>
        </div>
      </template>
    </NModal>
  </AdminLayout>
</template>

<style scoped>
.icons-scroll {
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-left: 25px;
  margin-right: -3px;
}

/* === 头部 === */
.head-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.head-actions button { height: 40px; }

/* === 上传区 === */
.upload-zone {
  background: var(--admin-card);
  border: 2px dashed var(--admin-border);
  border-radius: var(--admin-radius-card);
  padding: 16px 22px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex; flex-direction: row; align-items: center; gap: 14px;
}
.upload-zone:hover { border-color: var(--color-primary); background: var(--color-primary-soft); }
.upload-zone.active { border-color: var(--color-primary); background: var(--color-primary-soft); transform: scale(1.005); }
.upload-zone.disabled { opacity: 0.5; cursor: not-allowed; }
.upload-icon { color: var(--color-primary); opacity: 0.7; flex-shrink: 0; display: flex; align-items: center; }
.upload-zone:hover .upload-icon, .upload-zone.active .upload-icon { opacity: 1; transition: all 0.2s; }
.upload-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.upload-title { font-size: 0.92rem; font-weight: 600; color: var(--text-main); }
.upload-desc { font-size: 0.78rem; color: var(--text-tertiary); }

.name-section {
  background: var(--admin-card);
  border: 1px solid var(--admin-border);
  border-radius: var(--admin-radius-card);
  padding: 16px 20px;
}
.name-input-row .n-input { min-width: 240px; }
.name-hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  height: 22px;
  padding: 0 10px;
  border-radius: var(--radius-full);
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
}
.name-preview {
  display: block;
  margin-top: 6px;
  font-size: 0.78rem;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
}

/* === 图标库 === */
.library-card {
  background: var(--admin-card);
  border: 1px solid var(--admin-border);
  border-radius: var(--admin-radius-card);
  box-shadow: var(--admin-shadow-card);
  padding: 24px;
}
.library-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 16px; flex-wrap: wrap;
  margin-bottom: 20px;
}
.library-title { font-size: 1.05rem; font-weight: 700; color: var(--text-main); margin: 0 0 2px; }
.library-sub { font-size: 0.82rem; color: var(--text-tertiary); margin: 0; }
.library-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }

.icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
}
.icon-tile {
  background: var(--color-card-soft);
  border: 1.5px solid var(--admin-border);
  border-radius: 16px;
  overflow: hidden;
  transition: all 0.2s ease;
  position: relative;
  cursor: pointer;
}
.icon-tile:hover { border-color: var(--color-primary); transform: translateY(-2px); box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06); }
.icon-tile.selected { border-color: var(--color-primary); background: var(--color-primary-soft); }
.icon-tile-check {
  position: absolute;
  top: 8px; right: 8px;
  width: 24px; height: 24px;
  border-radius: 7px;
  background: #FFFFFF;
  border: 2px solid rgba(15, 23, 42, 0.22);
  display: flex; align-items: center; justify-content: center;
  color: var(--color-primary);
  z-index: 2;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.14);
  transition: all 0.15s;
}
.icon-tile:hover .icon-tile-check { border-color: var(--color-primary); }
.icon-tile.selected .icon-tile-check { background: var(--color-primary); color: #FFFFFF; border-color: var(--color-primary); box-shadow: 0 2px 8px rgba(79, 140, 255, 0.35); }

.icon-preview {
  aspect-ratio: 1;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%);
  padding: 12px;
}
.icon-preview img {
  max-width: 100%; max-height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.08));
}
.icon-meta {
  padding: 8px 10px 10px;
  background: var(--admin-card);
  border-top: 1px solid var(--admin-border);
}
.icon-name {
  font-size: 0.74rem;
  font-family: var(--font-mono);
  color: var(--text-main);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
}
.icon-info {
  display: flex; align-items: center; gap: 6px;
  font-size: 0.68rem; color: var(--text-tertiary);
  margin-bottom: 6px;
  flex-wrap: wrap;
}
.usage-pill {
  display: inline-flex; align-items: center;
  height: 18px; padding: 0 7px;
  border-radius: var(--radius-full);
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: 0.7rem;
  font-weight: 600;
}
.icon-actions { display: flex; gap: 4px; }
.icon-btn {
  flex: 1;
  display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  height: 24px; padding: 0 8px;
  border-radius: 8px;
  background: var(--color-card-soft);
  color: var(--text-sec);
  border: 1px solid var(--admin-border);
  font-size: 0.68rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}
.icon-btn:hover { background: var(--color-primary-soft); color: var(--color-primary); border-color: var(--color-primary-soft); }
.icon-btn.danger { color: #E55353; }
.icon-btn.danger:hover { background: rgba(229, 83, 83, 0.1); border-color: rgba(229, 83, 83, 0.2); color: #E55353; }
.icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* === 通用 === */
.btn-danger-soft {
  display: inline-flex;
  align-items: center; gap: 5px;
  height: 40px; padding: 0 14px;
  border-radius: var(--admin-radius-btn);
  background: rgba(229, 83, 83, 0.08);
  color: #E55353;
  border: 1px solid rgba(229, 83, 83, 0.18);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s;
}
.btn-danger-soft:hover { background: rgba(229, 83, 83, 0.16); border-color: rgba(229, 83, 83, 0.32); }

.loading-state, .empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-tertiary);
  font-size: 0.95rem;
  background: var(--color-card-soft);
  border: 1px dashed var(--admin-border);
  border-radius: var(--admin-radius-card);
  display: flex; flex-direction: column; align-items: center; gap: 8px;
}
.spinner {
  width: 36px; height: 36px;
  border: 3px solid var(--color-primary-soft);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 8px;
}
@keyframes spin { to { transform: rotate(360deg); } }
.spinning { animation: spin 1s linear infinite; transform-origin: center; }
.empty-illust { color: var(--color-primary); opacity: 0.7; }
.empty-title { font-size: 1rem; font-weight: 600; color: var(--text-main); margin: 0; }
.empty-title code { font-family: var(--font-mono); background: rgba(0,0,0,0.05); padding: 0 6px; border-radius: 4px; }
.empty-desc { font-size: 0.85rem; color: var(--text-tertiary); margin: 0; max-width: 420px; }

@media (max-width: 640px) {
  .head-actions { width: 100%; }
  .head-actions button { flex: 1; }
  .icon-grid { grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); }
  .library-actions { width: 100%; }
  .name-input-row .n-input { min-width: 0; }
}

/* === 删除确认弹窗 === */
.del-modal-body { text-align: center; padding: 8px 0; }
.del-modal-icon { font-size: 2.8rem; margin-bottom: 8px; }
.del-modal-title { font-size: 1.05rem; color: var(--text-main); margin: 0 0 8px; line-height: 1.5; }
.del-modal-title strong { color: #E55353; }
.del-modal-footer { display: flex; justify-content: center; gap: 12px; }
</style>
