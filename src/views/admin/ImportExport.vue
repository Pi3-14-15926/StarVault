<script setup lang="ts">
import { ref } from 'vue'
import { NUpload, NProgress, NAlert, useMessage } from 'naive-ui'
import type { UploadFileInfo } from 'naive-ui'
import AdminLayout from '../../components/admin/AdminLayout.vue'
import { getProjects, getCategories, getSettings, saveSettings, saveJSON } from '../../utils/api'
import { DEFAULT_SETTINGS } from '../../defaults'
import { commitAllData, triggerSync, triggerSyncBackup } from '../../utils/githubRepo'

const message = useMessage()
const exporting = ref(false)
const importing = ref(false)
const importProgress = ref(0)
const baking = ref(false)
const syncing = ref(false)
const backingUp = ref(false)
const publishing = ref(false)
const commitUrl = ref('')

function exportData() {
  exporting.value = true
  try {
    const data = {
      exportTime: new Date().toISOString(),
      version: '1.0.0',
      projects: getProjects(),
      categories: getCategories(),
      settings: getSettings(),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `softwarehub-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    message.success('导出成功')
  } catch (e: any) {
    message.error('导出失败: ' + e.message)
  } finally {
    exporting.value = false
  }
}

function importFromJSON({ file }: { file: UploadFileInfo }) {
  if (importing.value || !file.file) return
  importing.value = true
  importProgress.value = 0
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const text = e.target?.result as string
      const data = JSON.parse(text)
      if (!data.projects || !data.categories || !data.settings) {
        message.error('无效的备份文件：缺少必需字段')
        importing.value = false
        return
      }
      saveJSON('sh_projects', data.projects)
      importProgress.value = 33
      saveJSON('sh_categories', data.categories)
      importProgress.value = 66
      saveJSON('sh_settings', data.settings)
      importProgress.value = 100
      message.success(`导入成功！共 ${data.projects.length} 个项目、${data.categories.length} 个分类`)
    } catch (e: any) {
      message.error('导入失败: ' + e.message)
    } finally {
      importing.value = false
    }
  }
  reader.onerror = () => { message.error('文件读取失败'); importing.value = false }
  reader.readAsText(file.file as Blob)
}

async function bakeDefaults() {
  baking.value = true
  try {
    const settings = getSettings()
    const res = await fetch('/__bake-defaults', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: '未知错误' }))
      throw new Error(err.error || `HTTP ${res.status}`)
    }
    message.success('默认配置已写入 src/defaults.ts')
  } catch (e: any) {
    message.error('写入失败: ' + e.message)
  } finally {
    baking.value = false
  }
}

function resetDefaults() {
  saveSettings(DEFAULT_SETTINGS)
  message.success('设置已恢复为默认值')
}

async function runSync() {
  syncing.value = true
  try {
    await triggerSync()
    message.success('已触发同步工作流')
  } catch (e: any) {
    message.error('触发失败: ' + e.message)
  } finally { syncing.value = false }
}
async function runBackup() {
  backingUp.value = true
  try {
    await triggerSyncBackup()
    message.success('已触发备份工作流')
  } catch (e: any) {
    message.error('触发失败: ' + e.message)
  } finally { backingUp.value = false }
}
async function publishToRepo() {
  publishing.value = true
  commitUrl.value = ''
  try {
    const result = await commitAllData()
    commitUrl.value = `https://github.com/${result.repo}/commits/main`
    message.success(`已提交 ${result.files} 个文件到 ${result.repo}，等待构建部署...`)
  } catch (e: any) {
    message.error('发布失败: ' + e.message)
  } finally { publishing.value = false }
}
</script>

<template>
  <AdminLayout>
    <div class="io-page">
      <h2 class="page-title">📋 导入导出</h2>
      <p class="page-desc">数据备份、发布到 GitHub、触发同步任务</p>

      <div class="io-grid">
        <!-- 导出 -->
        <div class="io-card">
          <div class="io-icon">📤</div>
          <div class="io-content">
            <h3 class="io-title">导出数据</h3>
            <p class="io-desc">将所有数据（项目、分类、设置）导出为 JSON 文件下载</p>
            <button class="btn-primary" :disabled="exporting" @click="exportData">
              {{ exporting ? '导出中...' : '导出数据' }}
            </button>
          </div>
        </div>

        <!-- 导入 -->
        <div class="io-card">
          <div class="io-icon">📥</div>
          <div class="io-content">
            <h3 class="io-title">导入数据</h3>
            <p class="io-desc">从备份 JSON 文件恢复所有数据到 localStorage</p>
            <NUpload accept=".json" :max="1" :show-file-list="false" :disabled="importing" @change="importFromJSON">
              <button class="btn-primary" :disabled="importing">
                {{ importing ? '导入中...' : '选择备份文件' }}
              </button>
            </NUpload>
            <NProgress v-if="importing" type="line" :percentage="importProgress" class="import-progress" />
          </div>
        </div>

        <!-- GitHub Actions -->
        <div class="io-card io-card-wide">
          <div class="io-icon">⚡</div>
          <div class="io-content">
            <h3 class="io-title">GitHub Actions 同步</h3>
            <p class="io-desc">在 GitHub 服务器上自动执行 Release 同步和 WebDAV 备份，无需本地环境</p>
            <div class="action-row">
              <button class="btn-secondary" :disabled="syncing" @click="runSync">
                {{ syncing ? '触发中...' : '同步 Release' }}
              </button>
              <button class="btn-primary" :disabled="backingUp" @click="runBackup">
                {{ backingUp ? '触发中...' : '同步 + WebDAV 备份' }}
              </button>
              <span class="hint-text">每 6 小时自动执行，也可手动触发</span>
            </div>
          </div>
        </div>

        <!-- 发布到 GitHub -->
        <div class="io-card io-card-wide io-card-highlight">
          <div class="io-icon">🚀</div>
          <div class="io-content">
            <h3 class="io-title">发布到 GitHub</h3>
            <p class="io-desc">
              将 localStorage 中的所有数据（项目、分类、设置）提交到仓库，触发 GitHub Pages 重新构建，所有用户即可看到更新
            </p>
            <div class="action-row">
              <button class="btn-primary" :disabled="publishing" @click="publishToRepo">
                {{ publishing ? '提交中...' : '发布到 GitHub' }}
              </button>
              <a v-if="commitUrl" :href="commitUrl" target="_blank" class="commit-link">查看提交记录 →</a>
            </div>
          </div>
        </div>

        <!-- 写入默认配置 -->
        <div class="io-card">
          <div class="io-icon">🔧</div>
          <div class="io-content">
            <h3 class="io-title">写入默认配置</h3>
            <p class="io-desc">将当前设置烘焙到前端源码中，构建后所有设备样式一致</p>
            <div class="action-row">
              <button class="btn-primary" :disabled="baking" @click="bakeDefaults">
                {{ baking ? '写入中...' : '写入当前设置' }}
              </button>
              <button class="btn-ghost" @click="resetDefaults">恢复默认</button>
            </div>
          </div>
        </div>
      </div>

      <NAlert type="info" :bordered="false" class="info-alert">
        <strong>注意：</strong>「写入默认配置」会将当前后台设置覆盖到 <code>src/defaults.ts</code> 文件中。执行 <code>npm run build</code> 后新用户将自动使用此配置。
      </NAlert>
    </div>
  </AdminLayout>
</template>

<style scoped>
.io-page { display: flex; flex-direction: column; gap: 16px; max-width: 900px; }
.page-title { margin: 0; font-size: 1.4rem; font-weight: 700; color: var(--text-main); }
.page-desc { margin: 0; font-size: 0.88rem; color: var(--text-tertiary); }

.io-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.io-card {
  display: flex;
  gap: 16px;
  background: var(--color-card);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 22px;
  transition: transform 0.18s, box-shadow 0.18s;
}
.io-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
.io-card-wide { grid-column: 1 / -1; }
.io-card-highlight {
  background: var(--gradient-primary-soft);
  border-color: rgba(52, 120, 246, 0.2);
}
.io-icon {
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
.io-content { flex: 1; min-width: 0; }
.io-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0 0 4px;
}
.io-desc {
  font-size: 0.88rem;
  color: var(--text-sec);
  margin: 0 0 12px;
  line-height: 1.5;
}
.action-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.hint-text { font-size: 0.78rem; color: var(--text-tertiary); }
.commit-link { font-size: 0.88rem; color: var(--color-primary); text-decoration: none; font-weight: 500; }
.commit-link:hover { text-decoration: underline; }
.import-progress { margin-top: 12px; }

.info-alert {
  background: rgba(52, 120, 246, 0.06) !important;
  border-color: rgba(52, 120, 246, 0.2) !important;
}
.info-alert code {
  font-size: 0.8rem;
  background: var(--color-card);
  padding: 1px 6px;
  border-radius: 4px;
  font-family: var(--font-mono);
  color: var(--color-primary);
}

@media (max-width: 768px) {
  .io-grid { grid-template-columns: 1fr; }
  .io-card { flex-direction: column; }
  .io-icon { width: 36px; height: 36px; font-size: 1.2rem; }
}
</style>
