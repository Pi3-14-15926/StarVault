<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { NInput, NButton, NSelect, NSpace, NCard, NAlert, NSwitch, useMessage } from 'naive-ui'
import { useProjectStore } from '../../store/project'
import { useCategoryStore } from '../../store/category'
import { fetchReleases, releaseToVersion, fetchRepoDetail } from '../../utils/github'
import type { Version } from '../../types'
import AdminLayout from '../../components/admin/AdminLayout.vue'

const router = useRouter()
const route = useRoute()
const msg = useMessage()
const projects = useProjectStore()
const categories = useCategoryStore()

const isEdit = computed(() => !!route.params.id)
const existingProject = computed(() => projects.projects.find((p) => p.id === route.params.id))

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
  categoryId: '',
  githubRepo: '',
  website: '',
  featured: false,
})

const saving = ref(false)
const error = ref('')

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
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
    const versions = releases.map((r) => releaseToVersion(r))
    versions.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    form.value = {
      slug: slugify(detail.name),
      name: detail.name,
      description: detail.description || '',
      logo: detail.owner.avatar_url || '',
      sourceType: 'github',
      categoryId: form.value.categoryId,
      githubRepo: repo,
      website: '',
      featured: false,
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
  if (route.query.categoryId) {
    form.value.categoryId = route.query.categoryId as string
  }
  if (existingProject.value) {
    const p = existingProject.value
    form.value = {
      slug: p.slug, name: p.name, description: p.description, logo: p.logo,
      sourceType: p.sourceType, categoryId: p.categoryId,
      githubRepo: p.githubRepo || '', website: p.website || '', featured: p.featured,
    }
    step.value = 'review'
  }
})

async function doSave() {
  error.value = ''
  if (!form.value.name.trim() || !form.value.slug.trim()) {
    error.value = '名称和 Slug 不能为空'
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
      p.categoryId = form.value.categoryId
      p.githubRepo = form.value.githubRepo.trim() || undefined
      p.githubUrl = form.value.githubRepo.trim() ? `https://github.com/${form.value.githubRepo.trim()}` : undefined
      p.website = form.value.website.trim() || undefined
      p.featured = form.value.featured
      projects.save(p)
    }
    saving.value = false
    msg.success('保存成功')
    router.push('/admin/projects')
    return
  }
  const p = projects.createGitHub(form.value.slug.trim(), form.value.name.trim(), form.value.githubRepo.trim(), form.value.categoryId)
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
  p.versions = fetchedVersions.value
  if (fetchedVersions.value.length > 0) {
    p.latestVersion = fetchedVersions.value[0].version
    p.latestUpdateTime = fetchedVersions.value[0].publishedAt
  }
  projects.save(p)
  saving.value = false
  msg.success(`项目「${p.name}」创建成功`)
  setTimeout(() => router.push('/admin/projects'), 800)
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
          <h3 class="form-section-title">第一步 · 输入 GitHub 仓库</h3>
          <div class="field">
            <label>GitHub 仓库地址</label>
            <NInput
              v-model:value="repoInput"
              placeholder="例如: gedoor/legado  或  https://github.com/gedoor/legado"
              size="large"
            />
            <p class="field-hint">输入 GitHub 仓库地址或 owner/repo，系统将自动获取软件信息</p>
          </div>
          <NAlert v-if="fetchError" type="error" :show-icon="false" closable>{{ fetchError }}</NAlert>
          <div class="form-actions">
            <button class="btn-primary" :disabled="fetching" @click="doFetch">
              {{ fetching ? '获取中...' : '获取信息' }}
            </button>
            <button class="btn-secondary" @click="router.push('/admin/projects')">取消</button>
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
                v-model:value="form.categoryId"
                :options="categories.categories.map((c) => ({ label: `${c.icon || ''} ${c.name}`, value: c.id }))"
                placeholder="选择页面"
                clearable
              />
            </div>

            <div class="field field-full">
              <label>描述</label>
              <NInput v-model:value="form.description" type="textarea" rows="3" placeholder="软件简介" />
            </div>

            <div class="field">
              <label>Logo URL</label>
              <NInput v-model:value="form.logo" placeholder="图片链接" />
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
          </div>

          <div v-if="!isEdit && fetchedVersions.length > 0" class="versions-preview">
            <div class="preview-title">从 GitHub 获取的版本信息</div>
            <div class="preview-stats">
              <span>⭐ {{ fetchedStars?.toLocaleString() || '—' }}</span>
              <span>最新版本: {{ latestVersionDisplay }}</span>
              <span>共 {{ versionCount }} 个版本</span>
            </div>
          </div>

          <div class="form-actions">
            <button class="btn-primary" :disabled="saving" @click="doSave">
              {{ isEdit ? '保存修改' : '创建项目' }}
            </button>
            <button v-if="!isEdit" class="btn-secondary" @click="step = 'input'">返回修改仓库地址</button>
            <button class="btn-ghost" @click="router.push('/admin/projects')">取消</button>
          </div>
        </div>
      </div>
    </div>
  </AdminLayout>
</template>

<style scoped>
.form-page { display: flex; flex-direction: column; gap: 16px; max-width: 760px; }
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

.form-actions { display: flex; gap: 10px; flex-wrap: wrap; }

@media (max-width: 768px) {
  .form-grid { grid-template-columns: 1fr; }
  .form-card { padding: 20px; }
}
</style>
