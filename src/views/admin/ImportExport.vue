<script setup lang="ts">
import { ref } from 'vue'
import { NCard, NButton, NUpload, NAlert, NProgress, useMessage } from 'naive-ui'
import type { UploadFileInfo } from 'naive-ui'
import AdminLayout from '../../components/admin/AdminLayout.vue'
import { getProjects, getCategories, getSettings, saveSettings, saveJSON } from '../../utils/api'
import { DEFAULT_SETTINGS } from '../../defaults'

const message = useMessage()

const exporting = ref(false)

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

const importing = ref(false)
const importProgress = ref(0)

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
        message.error('无效的备份文件：缺少必需字段 (projects, categories, settings)')
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
  reader.onerror = () => {
    message.error('文件读取失败')
    importing.value = false
  }
  reader.readAsText(file.file as Blob)
}

const baking = ref(false)

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
</script>

<template>
  <AdminLayout>
    <h2 class="page-title">📋 导入导出</h2>

    <NCard title="📤 导出数据" size="small" class="action-card">
      <p class="card-desc">将所有数据（项目、分类、设置）导出为 JSON 文件下载</p>
      <NButton type="primary" :loading="exporting" :disabled="exporting" @click="exportData">
        导出数据
      </NButton>
    </NCard>

    <NCard title="📥 导入数据" size="small" class="action-card">
      <p class="card-desc">从备份 JSON 文件恢复所有数据到 localStorage</p>
      <NUpload accept=".json" :max="1" :show-file-list="false" :disabled="importing" @change="importFromJSON">
        <NButton :loading="importing" :disabled="importing">选择备份文件</NButton>
      </NUpload>
      <NProgress v-if="importing" type="line" :percentage="importProgress" class="import-progress" />
    </NCard>

    <NCard title="🔧 写入默认配置" size="small" class="action-card">
      <p class="card-desc">将当前设置烘焙到前端源码中，构建后所有设备样式一致</p>
      <div class="bake-actions">
        <NButton type="primary" :loading="baking" :disabled="baking" @click="bakeDefaults">
          写入当前设置
        </NButton>
        <NButton quaternary size="tiny" @click="resetDefaults">恢复默认</NButton>
      </div>
    </NCard>

    <NAlert type="info" :bordered="false" class="info-alert">
      <strong>注意：</strong>「写入默认配置」会将当前后台设置覆盖到 <code>src/defaults.ts</code> 文件中。
      执行 <code>npm run build</code> 后新用户将自动使用此配置。
    </NAlert>
  </AdminLayout>
</template>

<style scoped>
.page-title { margin: 0 0 20px; font-size: 1.3rem; }
.action-card { max-width: 680px; margin-bottom: 16px; }
.card-desc { font-size: 0.85rem; color: var(--text-secondary, #888); margin: 0 0 12px; }
.import-progress { margin-top: 12px; }
.bake-actions { display: flex; align-items: center; gap: 12px; }
.info-alert { max-width: 680px; }
.info-alert code { font-size: 0.8rem; background: var(--code-bg, #f5f5f5); padding: 1px 4px; border-radius: 3px; }
</style>
