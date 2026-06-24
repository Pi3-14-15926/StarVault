<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { NInput, NButton, NSelect, NSpace, NCard, NAlert, NSwitch, NPopconfirm, useMessage } from 'naive-ui'
import { useProjectStore } from '../../store/project'
import { useCategoryStore } from '../../store/category'
import { useSettingStore } from '../../store/settings'
import { fetchReleases, releaseToVersion, fetchRepoDetail, guessPlatform } from '../../utils/github'
import { compressImage, blobToBase64, fmtSize } from '../../utils/imageCompressor'
import { uploadIcon, listIcons, type IconListItem } from '../../utils/iconsApi'
import { resolveIconUrl, buildIconUrls } from '../../utils/iconUrl'
import * as api from '../../utils/api'
import { platformClass, platformIcon } from '../../utils/platformTag'
import { uid } from '../../utils'
import type { Version, Download, Platform, RelatedArticle } from '../../types'
import AdminLayout from '../../components/admin/AdminLayout.vue'

const router = useRouter()
const route = useRoute()
const msg = useMessage()
const projects = useProjectStore()
const categories = useCategoryStore()
const settings = useSettingStore()

const isEdit = computed(() => !!route.params.id)
const existingProject = computed(() => projects.software.find((p) => p.id === route.params.id))

const step = ref<'input' | 'review'>('input')
const repoInput = ref('')
const fetching = ref(false)
const fetchError = ref('')

const form = ref({
  slug: '',
  name: '',
  description: '',
  logo: '',
  sourceType: 'github' as 'github' | 'custom',
  categorySlug: '',
  githubRepo: '',
  website: '',
  featured: false,
  relatedArticles: [] as RelatedArticle[],
})

const newArticleName = ref('')
const newArticleUrl = ref('')

const saving = ref(false)
const error = ref('')

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function skipToManual() {
  form.value = {
    slug: '',
    name: '',
    description: '',
    logo: '',
    sourceType: 'custom',
    categorySlug: form.value.categorySlug,
    githubRepo: '',
    website: '',
    featured: false,
    relatedArticles: [],
  }
  fetchedVersions.value = []
  fetchedStars.value = 0
  fetchedForks.value = 0
  step.value = 'review'
}
function parseRepo(input: string): string {
  const match = input.match(/github\.com\/([^/]+\/[^/]+?)(?:\/|$)/) || input.match(/^([\w.-]+\/[\w.-]+)/)
  return match ? match[1].replace(/\.git$/, '') : input.trim()
}

const fetchedVersions = ref<Version[]>([])
const fetchedStars = ref(0)
const fetchedForks = ref(0)
const latestVersionDisplay = computed(() => fetchedVersions.value[0]?.version || '—')
const versionCount = computed(() => fetchedVersions.value.length)

async function doFetch() {
  const repo = parseRepo(repoInput.value)
  if (!repo) {
    fetchError.value = '请输入 GitHub 仓库地址或 owner/repo'
    return
  }
  fetchError.value = ''
  fetching.value = true
  try {
    const [detail, releases] = await Promise.all([
      fetchRepoDetail(repo),
      fetchReleases(repo),
    ])
    const tempId = 'pending'
    const versions: Version[] = releases.map((r) => releaseToVersion(r, tempId))
    versions.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    /* 缓存原始 assets 以便 doSave 时写入 Download 实体 */
    const tagMap = new Map<string, any[]>()
    for (const r of releases) tagMap.set(r.tag_name, r.assets || [])
    releasesByTag.value = tagMap
    form.value = {
      slug: slugify(detail.name),
      name: detail.name,
      description: detail.description || '',
      logo: detail.owner.avatar_url || '',
      sourceType: 'github',
      categorySlug: form.value.categorySlug,
      githubRepo: repo,
      website: '',
      featured: false,
      relatedArticles: [],
    }
    fetchedVersions.value = versions
    fetchedStars.value = detail.stargazers_count
    fetchedForks.value = detail.forks_count
    step.value = 'review'
    msg.success(`已获取 ${detail.name} 的信息，共 ${versions.length} 个版本`)
  } catch (e: any) {
    fetchError.value = `获取失败: ${e.message}`
  }
  fetching.value = false
}

onMounted(() => {
  categories.refresh()
  settings.refresh()
  if (route.query.categoryId) {
    const catId = route.query.categoryId as string
    const cat = categories.categories.find((c) => c.id === catId)
    if (cat) form.value.categorySlug = cat.slug
  }
  if (existingProject.value) {
    const p = existingProject.value
    form.value = {
      slug: p.slug, name: p.name, description: p.description, logo: p.logo,
      sourceType: p.sourceType, categorySlug: p.categorySlug,
      githubRepo: p.githubRepo || '', website: p.website || '', featured: p.featured,
      relatedArticles: p.relatedArticles ? [...p.relatedArticles] : [],
    }
    step.value = 'review'
  }
  loadIconLibrary()
})

async function doSave() {
  error.value = ''
  if (!form.value.name.trim() || !form.value.slug.trim()) {
    error.value = '名称和 Slug 不能为空'
    return
  }
  if (!form.value.categorySlug) {
    msg.warning('软件未选所属页面，将无法备份软件！')
    return
  }
  saving.value = true
  if (isEdit.value) {
    const p = existingProject.value
    if (p) {
      const newSlug = form.value.slug.trim()
      if (newSlug !== p.slug && projects.slugExists(newSlug)) {
        error.value = 'slug 已被其他项目使用'
        saving.value = false
        return
      }
      p.slug = newSlug
      p.name = form.value.name.trim()
      p.description = form.value.description.trim()
      p.logo = form.value.logo.trim()
      p.sourceType = form.value.sourceType
      p.categorySlug = form.value.categorySlug
      p.githubRepo = form.value.githubRepo.trim() || undefined
      p.githubUrl = form.value.githubRepo.trim() ? `https://github.com/${form.value.githubRepo.trim()}` : undefined
      p.website = form.value.website.trim() || undefined
      p.featured = form.value.featured
      p.relatedArticles = form.value.relatedArticles.length > 0 ? form.value.relatedArticles : undefined
      projects.save(p)
    }
    saving.value = false
    msg.success('保存成功')
    const catId = route.query.categoryId as string
    router.push(catId ? `/admin/categories/${catId}/projects` : '/admin/projects')
    return
  }
  const p = form.value.sourceType === 'custom'
    ? projects.createCustom(form.value.slug.trim(), form.value.name.trim(), form.value.categorySlug)
    : projects.createGitHub(form.value.slug.trim(), form.value.name.trim(), form.value.githubRepo.trim(), form.value.categorySlug)
  if (!p) {
    saving.value = false
    error.value = '创建项目失败，slug 可能已存在'
    return
  }
  p.description = form.value.description.trim()
  p.logo = form.value.logo.trim()
  p.website = form.value.website.trim() || undefined
  p.featured = form.value.featured
  p.stars = fetchedStars.value || undefined
  p.forks = fetchedForks.value || undefined
  p.relatedArticles = form.value.relatedArticles.length > 0 ? form.value.relatedArticles : undefined
  projects.save(p)
  /* 把从 GitHub 获取的版本和下载逐个写入分层存储 */
  for (const fetched of fetchedVersions.value) {
    const realV: Version = {
      id: uid(),
      projectId: p.id,
      version: fetched.version,
      publishedAt: fetched.publishedAt,
      changelog: fetched.changelog,
      downloadIds: [],
    }
    api.addVersion(realV)
    const r = releasesByTag.value.get(realV.version) || []
    for (const a of r) {
      api.addDownload({
        id: uid(),
        versionId: realV.id,
        platform: guessPlatform(a.name),
        filename: a.name,
        size: `${(a.size / 1024 / 1024).toFixed(1)} MB`,
        url: a.browser_download_url,
      })
    }
  }
  saving.value = false
  msg.success(`项目「${p.name}」创建成功`)
  const catId = route.query.categoryId as string
  setTimeout(() => router.push(catId ? `/admin/categories/${catId}/projects` : '/admin/projects'), 800)
}

/* 缓存 GitHub release 原始数据，用于写入下载项 */
const releasesByTag = ref<Map<string, any[]>>(new Map())

/* === Logo 上传备选 === */
const logoDragOver = ref(false)
const uploadingLogo = ref(false)
const logoFileInput = ref<HTMLInputElement | null>(null)
const iconLibrary = ref<IconListItem[]>([])
const iconPickerOpen = ref(false)
const iconPickerKeyword = ref('')

const previewLogoUrl = computed(() => {
  if (!form.value.logo) return ''
  return resolveIconUrl(form.value.logo, settings.settings)
})

const filteredLibraryIcons = computed(() => {
  if (!iconPickerKeyword.value.trim()) return iconLibrary.value
  const kw = iconPickerKeyword.value.toLowerCase()
  return iconLibrary.value.filter((i) => i.name.toLowerCase().includes(kw))
})

async function loadIconLibrary() {
  if (!import.meta.env.DEV) return
  try {
    const r = await listIcons()
    iconLibrary.value = r.items || []
  } catch { iconLibrary.value = [] }
}

function logoCdnUrl(item: IconListItem): string {
  return buildIconUrls(item.name, settings.settings.iconCdnMode || 'jsdelivr', settings.settings.iconCdnCustomBase).cdnUrl
}

function pickLogoFile() { logoFileInput.value?.click() }
function onLogoDragOver(e: DragEvent) { e.preventDefault(); logoDragOver.value = true }
function onLogoDragLeave() { logoDragOver.value = false }
function onLogoDrop(e: DragEvent) {
  e.preventDefault()
  logoDragOver.value = false
  const f = e.dataTransfer?.files?.[0]
  if (f) handleLogoFile(f)
}
function onLogoFileChange(e: Event) {
  const t = e.target as HTMLInputElement
  if (t.files?.[0]) handleLogoFile(t.files[0])
  t.value = ''
}

function slugifyForIcon(name: string): string {
  const base = (name || '').trim()
  if (!base) return 'icon'
  return base
    .replace(/[\/\\:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'icon'
}

async function handleLogoFile(file: File) {
  if (!file.type.startsWith('image/')) {
    msg.error('请选择图片文件')
    return
  }
  uploadingLogo.value = true
  try {
    const compressed = await compressImage(file, { maxSize: 256, quality: 0.85 })
    const base64 = await blobToBase64(compressed.blob)
    const ext = compressed.filename.split('.').pop() || 'webp'
    const slug = slugifyForIcon(form.value.name)
    const finalName = `${slug}.${ext}`
    const result = await uploadIcon(finalName, base64)
    form.value.logo = result.rawUrl
    const tag = result.overwritten ? '（已覆盖同名文件）' : ''
    msg.success(`已上传 ${result.name}（${fmtSize(result.size)}）${tag}`)
    await loadIconLibrary()
  } catch (e: any) {
    msg.error(`上传失败: ${e.message}`)
  }
  uploadingLogo.value = false
}

function selectLibraryIcon(item: IconListItem) {
  form.value.logo = item.rawUrl
  iconPickerOpen.value = false
  msg.success(`已选择: ${item.name}`)
}

function openIconPicker() {
  iconPickerOpen.value = true
  loadIconLibrary()
}

/* === 平台管理（编辑模式） === */
const allDownloads = ref<Download[]>([])

function refreshDownloads() {
  if (!existingProject.value) {
    allDownloads.value = []
    return
  }
  const list: Download[] = []
  for (const v of api.getSoftwareVersions(existingProject.value.id)) {
    for (const dl of api.getVersionDownloads(v.id)) list.push(dl)
  }
  allDownloads.value = list
}

const platformStats = computed(() => {
  const map = new Map<Platform, number>()
  for (const dl of allDownloads.value) map.set(dl.platform, (map.get(dl.platform) || 0) + 1)
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
})

const allPlatforms: { value: Platform; label: string; icon: string }[] = [
  { value: 'Android', label: 'Android', icon: '🤖' },
  { value: 'Windows', label: 'Windows', icon: '🪟' },
  { value: 'MacOS',   label: 'MacOS',   icon: '🍎' },
  { value: 'Linux',   label: 'Linux',   icon: '🐧' },
  { value: 'iOS',     label: 'iOS',     icon: '📱' },
  { value: 'Web',     label: 'Web',     icon: '🌐' },
  { value: 'Other',   label: 'Other',   icon: '📁' },
]

/* 一键按文件名重新推断所有下载项 platform */
function reGuessPlatforms() {
  if (!existingProject.value) return
  if (allDownloads.value.length === 0) {
    msg.warning('该软件暂无下载项')
    return
  }
  if (!confirm(`将按文件名重新推断 ${allDownloads.value.length} 个下载项的平台，是否继续？`)) return
  let changed = 0
  for (const dl of allDownloads.value) {
    const newPlat = guessPlatform(dl.filename)
    if (newPlat !== dl.platform) {
      api.updateDownload({ ...dl, platform: newPlat })
      changed++
    }
  }
  refreshDownloads()
  msg.success(`已重新推断 ${allDownloads.value.length} 个下载项（${changed} 项发生变更）`)
}

watch(existingProject, refreshDownloads, { immediate: true })
watch(() => route.params.id, refreshDownloads)

/* === 关联文章管理 === */
function addArticle() {
  const name = newArticleName.value.trim()
  const url = newArticleUrl.value.trim()
  if (!name || !url) {
    msg.warning('请填写文章名称和链接')
    return
  }
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    msg.warning('请输入有效的文章链接')
    return
  }
  form.value.relatedArticles.push({ name, url })
  newArticleName.value = ''
  newArticleUrl.value = ''
  msg.success('已添加关联文章')
}

function removeArticle(index: number) {
  form.value.relatedArticles.splice(index, 1)
  msg.success('已移除关联文章')
}
</script>

<template>
  <AdminLayout>
    <div class="form-page">
      <h2 class="page-title">{{ isEdit ? '✏️ 编辑软件' : '➕ 新增软件' }}</h2>

      <NAlert v-if="error" type="error" closable :show-icon="false" class="error-alert">{{ error }}</NAlert>

      <!-- 第一步 -->
      <div v-if="!isEdit && step === 'input'" class="form-card">
        <div class="form">
          <h3 class="form-section-title">第一步 · 输入仓库地址（可选）</h3>
          <div class="field">
            <label>GitHub 仓库地址</label>
            <NInput
              v-model:value="repoInput"
              placeholder="例如: gedoor/legado  或  https://github.com/gedoor/legado"
              size="large"
            />
            <p class="field-hint">输入 GitHub 仓库地址或 owner/repo，系统将自动获取软件信息；也可跳过手动填写</p>
          </div>
          <NAlert v-if="fetchError" type="error" :show-icon="false" closable>{{ fetchError }}</NAlert>
          <div class="form-actions">
            <button class="btn-primary" :disabled="fetching" @click="doFetch">
              {{ fetching ? '获取中...' : '获取信息' }}
            </button>
            <button class="btn-secondary" @click="skipToManual">手动填写</button>
            <button class="btn-secondary" @click="router.push(route.query.categoryId ? `/admin/categories/${route.query.categoryId}/projects` : '/admin/projects')">取消</button>
          </div>
        </div>
      </div>

      <!-- 第二步 -->
      <div v-if="step === 'review'" class="form-card">
        <div class="form">
          <h3 class="form-section-title">第二步 · 审核 & 保存</h3>

          <div class="form-grid">
            <div class="field">
              <label>软件名称 <span class="required">*</span></label>
              <NInput v-model:value="form.name" placeholder="软件名称" />
            </div>

            <div class="field">
              <label>Slug（URL 标识） <span class="required">*</span></label>
              <NInput v-model:value="form.slug" placeholder="url 标识" />
            </div>

            <div class="field">
              <label>所属页面</label>
              <NSelect
                v-model:value="form.categorySlug"
                :options="categories.categories.map((c) => ({ label: `${c.icon || ''} ${c.name}`, value: c.slug }))"
                placeholder="选择页面"
                clearable
              />
            </div>

            <div class="field field-full">
              <label>描述</label>
              <NInput v-model:value="form.description" type="textarea" rows="3" placeholder="软件简介" />
            </div>

            <div class="field field-full">
              <label>软件图标</label>
              <div class="logo-field">
                <div class="logo-preview">
                  <img v-if="previewLogoUrl" :src="previewLogoUrl" :alt="form.name" />
                  <div v-else class="logo-placeholder">
                    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                  </div>
                </div>
                <div class="logo-inputs">
                  <NInput v-model:value="form.logo" placeholder="图标 URL（推荐，自动从仓库获取的 URL 即可）" />
                  <div class="logo-actions">
                    <button
                      type="button"
                      class="btn-secondary btn-sm"
                      :class="{ drop: logoDragOver }"
                      @click="pickLogoFile"
                      @dragover="onLogoDragOver"
                      @dragleave="onLogoDragLeave"
                      @drop="onLogoDrop"
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                      {{ uploadingLogo ? '上传中...' : '本地上传' }}
                    </button>
                    <button type="button" class="btn-ghost btn-sm" @click="openIconPicker">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                      </svg>
                      从图标库选择
                    </button>
                    <input ref="logoFileInput" type="file" accept="image/*" style="display:none" @change="onLogoFileChange" />
                  </div>
                  <p class="field-hint">
                    <span v-if="form.logo">将自动通过 CDN 加速显示（当前设置：{{ settings.settings.iconCdnMode || 'jsdelivr' }}）</span>
                    <span v-else>支持 URL · 本地上传（自动压缩为 256×256 WebP）· 从图标库选择</span>
                  </p>
                </div>
              </div>
            </div>

            <div class="field">
              <label>官方网站</label>
              <NInput v-model:value="form.website" placeholder="https://..." />
            </div>

            <div class="field field-full">
              <label>GitHub 仓库</label>
              <NInput v-model:value="form.githubRepo" placeholder="owner/repo" />
            </div>

            <div class="field field-full">
              <label class="switch-label">
                <NSwitch v-model:value="form.featured" />
                <span>设为推荐（首页 Hero 轮播）</span>
              </label>
            </div>

            <div class="field field-full">
              <label>关联文章</label>
              <div class="articles-section">
                <div v-if="form.relatedArticles.length > 0" class="articles-list">
                  <div v-for="(article, index) in form.relatedArticles" :key="index" class="article-item">
                    <div class="article-info">
                      <span class="article-name">{{ article.name }}</span>
                      <span class="article-url">{{ article.url }}</span>
                    </div>
                    <button type="button" class="btn-remove" @click="removeArticle(index)">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                </div>
                <div v-else class="articles-empty">暂无关联文章</div>
                <div class="article-add-form">
                  <NInput v-model:value="newArticleName" placeholder="文章名称" size="small" />
                  <NInput v-model:value="newArticleUrl" placeholder="文章链接 https://..." size="small" />
                  <button type="button" class="btn-add" @click="addArticle">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    添加
                  </button>
                </div>
                <p class="field-hint">添加与该软件相关的文章链接，将在软件详情页显示</p>
              </div>
            </div>
          </div>

          <div v-if="!isEdit && fetchedVersions.length > 0" class="versions-preview">
            <div class="preview-title">从 GitHub 获取的版本信息</div>
            <div class="preview-stats">
              <span>⭐ {{ fetchedStars?.toLocaleString() || '—' }}</span>
              <span>最新版本: {{ latestVersionDisplay }}</span>
              <span>共 {{ versionCount }} 个版本</span>
            </div>
          </div>

          <!-- 平台管理（仅编辑模式） -->
          <div v-if="isEdit" class="platform-panel">
            <div class="panel-head">
              <h3 class="panel-title">📋 平台管理</h3>
              <span class="panel-hint">当前 {{ allDownloads.length }} 个下载项，分布于 {{ platformStats.length }} 个平台</span>
            </div>
            <div v-if="allDownloads.length === 0" class="platform-empty">该软件暂无下载项，请先在「版本管理」中添加</div>
            <div v-else class="platform-stats">
              <div v-for="[plat, count] in platformStats" :key="plat" class="plat-stat">
                <span :class="['plat-tag', platformClass(plat)]">
                  <span>{{ platformIcon(plat) }}</span>{{ plat }}
                </span>
                <span class="plat-count">× {{ count }}</span>
              </div>
            </div>
            <div class="platform-actions">
              <button type="button" class="btn-secondary btn-sm" @click="reGuessPlatforms">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
                按文件名重新推断所有平台
              </button>
              <button type="button" class="btn-ghost btn-sm" @click="router.push('/admin/versions')">
                前往版本管理 →
              </button>
            </div>
          </div>

          <div class="form-actions">
            <button class="btn-primary" :disabled="saving" @click="doSave">
              {{ isEdit ? '保存修改' : '创建项目' }}
            </button>
            <button v-if="!isEdit && form.sourceType === 'github'" class="btn-secondary" @click="step = 'input'">返回修改仓库地址</button>
            <button v-if="!isEdit && form.sourceType === 'custom'" class="btn-secondary" @click="step = 'input'">返回</button>
            <button class="btn-ghost" @click="router.push(route.query.categoryId ? `/admin/categories/${route.query.categoryId}/projects` : '/admin/projects')">取消</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 图标库选择弹窗 -->
    <div v-if="iconPickerOpen" class="picker-mask" @click.self="iconPickerOpen = false">
      <div class="picker-panel">
        <header class="picker-head">
          <div>
            <h3 class="picker-title">从图标库选择</h3>
            <p class="picker-sub">点击图标直接填入 URL（自动使用 CDN 加速）</p>
          </div>
          <button class="picker-close" @click="iconPickerOpen = false">×</button>
        </header>
        <div class="picker-search">
          <input v-model="iconPickerKeyword" placeholder="搜索图标名..." class="picker-search-input" />
        </div>
        <div v-if="iconLibrary.length === 0" class="picker-empty">
          <p>图标库还是空的，请先到「图标管理」页面上传图标</p>
          <button class="btn-primary" @click="router.push('/admin/icons'); iconPickerOpen = false">前往图标管理</button>
        </div>
        <div v-else class="picker-grid">
          <div
            v-for="icon in filteredLibraryIcons"
            :key="icon.name"
            class="picker-tile"
            @click="selectLibraryIcon(icon)"
          >
            <img :src="logoCdnUrl(icon) + '?v=' + Date.now()" :alt="icon.name" />
            <div class="picker-name">{{ icon.name }}</div>
          </div>
        </div>
      </div>
    </div>
  </AdminLayout>
</template>

<style scoped>
.form-page { display: flex; flex-direction: column; gap: 16px; max-width: 760px; padding-left: 25px; margin-right: -3px; }
.page-title { margin: 0; font-size: 1.4rem; font-weight: 700; color: var(--text-main); }
.error-alert { background: rgba(255, 107, 107, 0.08) !important; border-color: rgba(255, 107, 107, 0.2) !important; color: var(--color-error) !important; }

.form-card {
  background: var(--color-card);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 28px;
}
.form { display: flex; flex-direction: column; gap: 20px; }
.form-section-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0 0 4px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-soft);
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.field { display: flex; flex-direction: column; }
.field-full { grid-column: 1 / -1; }
.field label { font-size: 0.85rem; font-weight: 600; color: var(--text-sec); margin-bottom: 6px; }
.field-hint { font-size: 0.78rem; color: var(--text-tertiary); margin: 6px 0 0; }
.required { color: var(--color-error); }
.switch-label { display: flex; align-items: center; gap: 10px; font-size: 0.9rem; font-weight: 500; cursor: pointer; }

.versions-preview {
  background: var(--color-card-soft);
  padding: 14px 16px;
  border-radius: var(--radius-md);
  border-left: 3px solid var(--color-primary);
}
.preview-title { font-weight: 700; font-size: 0.92rem; margin-bottom: 8px; color: var(--text-main); }
.preview-stats { display: flex; gap: 18px; font-size: 0.85rem; color: var(--text-sec); flex-wrap: wrap; }

/* === 平台管理面板 === */
.platform-panel {
  background: var(--color-card-soft);
  padding: 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-soft);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.platform-panel .panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px;
}
.platform-panel .panel-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
}
.platform-panel .panel-hint {
  font-size: 0.78rem;
  color: var(--text-tertiary);
}
.platform-empty {
  font-size: 0.85rem;
  color: var(--text-tertiary);
  text-align: center;
  padding: 16px 0;
  font-style: italic;
}
.platform-stats {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
}
.plat-stat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.plat-count {
  font-size: 0.78rem;
  color: var(--text-tertiary);
  font-weight: 500;
  font-family: var(--font-mono);
}
.platform-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding-top: 4px;
  border-top: 1px dashed var(--border-soft);
}

.form-actions { display: flex; gap: 10px; }
.form-actions .btn-primary, .form-actions .btn-secondary, .form-actions .btn-ghost { flex: 1; min-width: 0; }

/* === Logo 字段 === */
.logo-field {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}
.logo-preview {
  width: 80px;
  height: 80px;
  border-radius: 16px;
  background: linear-gradient(135deg, #E0EAFE 0%, #EDE7FF 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.06);
}
.logo-preview img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.08));
}
.logo-placeholder { color: #9CA3AF; }
.logo-inputs { flex: 1; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.logo-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.btn-sm { height: 32px !important; padding: 0 12px !important; font-size: 0.82rem !important; border-radius: 10px !important; }
.btn-secondary.drop { background: var(--color-primary-soft); border-color: var(--color-primary); color: var(--color-primary); }

/* === 图标库选择弹窗 === */
.picker-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  animation: fadeIn 0.2s ease;
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.picker-panel {
  background: var(--admin-card);
  border-radius: var(--admin-radius-card);
  width: 100%;
  max-width: 720px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: panelRise 0.25s ease;
}
@keyframes panelRise { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
.picker-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--admin-border);
}
.picker-title { font-size: 1.05rem; font-weight: 700; color: var(--text-main); margin: 0 0 2px; }
.picker-sub { font-size: 0.82rem; color: var(--text-tertiary); margin: 0; }
.picker-close {
  width: 32px; height: 32px;
  border: none; background: var(--color-card-soft);
  border-radius: 10px;
  font-size: 1.2rem;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all 0.15s;
}
.picker-close:hover { background: rgba(229, 83, 83, 0.1); color: #E55353; }
.picker-search { padding: 16px 24px; }
.picker-search-input {
  width: 100%;
  height: 40px;
  padding: 0 16px;
  border: 1px solid var(--admin-border);
  border-radius: var(--radius-full);
  background: var(--color-card-soft);
  font-size: 0.9rem;
  outline: none;
  transition: all 0.15s;
}
.picker-search-input:focus { border-color: var(--color-primary); box-shadow: 0 0 0 3px var(--color-primary-soft); background: var(--admin-card); }
.picker-grid {
  flex: 1;
  overflow-y: auto;
  padding: 0 24px 24px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 12px;
}
.picker-tile {
  background: var(--color-card-soft);
  border: 1.5px solid var(--admin-border);
  border-radius: 14px;
  padding: 12px;
  text-align: center;
  cursor: pointer;
  transition: all 0.18s;
}
.picker-tile:hover { border-color: var(--color-primary); transform: translateY(-2px); box-shadow: 0 8px 20px rgba(15, 23, 42, 0.06); }
.picker-tile img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: contain;
  margin-bottom: 6px;
}
.picker-name {
  font-size: 0.7rem;
  font-family: var(--font-mono);
  color: var(--text-sec);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.picker-empty {
  padding: 40px 24px;
  text-align: center;
  color: var(--text-tertiary);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

@media (max-width: 768px) {
  .form-grid { grid-template-columns: 1fr; }
  .form-card { padding: 20px; }
  .logo-field { flex-direction: column; }
  .picker-panel { max-height: 90vh; }
  .picker-grid { grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); }
  .form-actions { flex-wrap: nowrap; }
  .form-actions .btn-primary, .form-actions .btn-secondary, .form-actions .btn-ghost { font-size: 0.85rem; padding: 10px 12px; white-space: nowrap; }
  .article-add-form { flex-direction: column; }
}

/* === 关联文章 === */
.articles-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.articles-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.article-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--color-card-soft);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-md);
  transition: border-color 0.18s;
}
.article-item:hover {
  border-color: var(--color-primary);
}
.article-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.article-name {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text-main);
}
.article-url {
  font-size: 0.75rem;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.btn-remove {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.18s, color 0.18s;
}
.btn-remove:hover {
  background: rgba(255, 107, 107, 0.1);
  color: var(--color-error);
}
.articles-empty {
  font-size: 0.85rem;
  color: var(--text-tertiary);
  text-align: center;
  padding: 12px;
  background: var(--color-card-soft);
  border-radius: var(--radius-md);
  font-style: italic;
}
.article-add-form {
  display: flex;
  gap: 8px;
  align-items: center;
}
.btn-add {
  height: 32px;
  padding: 0 14px;
  border-radius: var(--radius-sm);
  border: none;
  background: var(--gradient-primary);
  color: var(--text-on-primary);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  transition: transform 0.15s, box-shadow 0.18s;
}
.btn-add:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-primary);
}
</style>
