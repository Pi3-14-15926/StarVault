<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { NInput, NSwitch, NSelect, NForm, NFormItem, useMessage } from 'naive-ui'
import { useSettingStore } from '../../store/settings'
import AdminLayout from '../../components/admin/AdminLayout.vue'

const store = useSettingStore()
const message = useMessage()

const form = ref({
  siteName: '',
  logo: '',
  footer: '',
  admins: '',
  storageNote: '',
  ghProxyEnabled: false,
  ghProxyUrl: '',
  syncEnabled: false,
  syncIntervalHours: 6,
  backupEnabled: false,
  backupIntervalHours: 24,
})

onMounted(() => {
  store.refresh()
  const s = store.settings
  const sc = s.schedule
  form.value = {
    siteName: s.siteName, logo: s.logo, footer: s.footer || '',
    admins: (s.admins || []).join(', '), storageNote: s.storageNote || '',
    ghProxyEnabled: s.ghProxyEnabled ?? false, ghProxyUrl: s.ghProxyUrl || '',
    syncEnabled: sc?.syncEnabled ?? false, syncIntervalHours: sc?.syncIntervalHours ?? 6,
    backupEnabled: sc?.backupEnabled ?? false, backupIntervalHours: sc?.backupIntervalHours ?? 24,
  }
})

function doSave() {
  store.save({
    siteName: form.value.siteName,
    logo: form.value.logo,
    footer: form.value.footer || undefined,
    admins: form.value.admins.split(/[,，]/).map((a) => a.trim()).filter(Boolean),
    storageNote: form.value.storageNote || undefined,
    ghProxyEnabled: form.value.ghProxyEnabled,
    ghProxyUrl: form.value.ghProxyUrl || undefined,
    schedule: {
      syncEnabled: form.value.syncEnabled,
      syncIntervalHours: form.value.syncIntervalHours,
      backupEnabled: form.value.backupEnabled,
      backupIntervalHours: form.value.backupIntervalHours,
    },
  })
  message.success('设置已保存')
}
</script>

<template>
  <AdminLayout>
    <div class="settings-page">
      <h2 class="page-title">⚙️ 网站设置</h2>
      <p class="page-desc">配置站点名称、Logo、定时任务、GitHub 代理等</p>

      <div class="settings-grid">
        <!-- 网站配置 -->
        <div class="settings-card">
          <div class="card-icon">🌐</div>
          <h3 class="card-title">网站配置</h3>
          <NForm :model="form" label-placement="top">
            <NFormItem label="站点名称">
              <NInput v-model:value="form.siteName" placeholder="Software Hub" />
            </NFormItem>
            <NFormItem label="网站图标">
              <NInput v-model:value="form.logo" placeholder="网站图标图片链接（可选）" />
            </NFormItem>
            <NFormItem label="页脚文字">
              <NInput v-model:value="form.footer" type="textarea" rows="2" placeholder="Powered by Software Hub" />
            </NFormItem>
            <NFormItem label="网站说明">
              <NInput v-model:value="form.storageNote" placeholder="数据存储在 GitHub JSON 文件，零服务器成本" />
            </NFormItem>
            <NFormItem label="管理员（GitHub 用户名，逗号分隔）">
              <NInput v-model:value="form.admins" placeholder="如: user1, user2" />
            </NFormItem>
          </NForm>
        </div>

        <!-- 定时设置 -->
        <div class="settings-card">
          <div class="card-icon">⏰</div>
          <h3 class="card-title">定时任务</h3>
          <NForm :model="form" label-placement="top">
            <NFormItem>
              <div class="switch-row">
                <NSwitch v-model:value="form.syncEnabled" />
                <span class="switch-label-text">自动同步 GitHub</span>
              </div>
            </NFormItem>
            <NFormItem v-if="form.syncEnabled" label="同步间隔">
              <NSelect
                v-model:value="form.syncIntervalHours"
                :options="[
                  { label: '每 1 小时', value: 1 },
                  { label: '每 6 小时', value: 6 },
                  { label: '每 12 小时', value: 12 },
                  { label: '每天', value: 24 },
                ]"
              />
            </NFormItem>

            <NFormItem>
              <div class="switch-row">
                <NSwitch v-model:value="form.backupEnabled" />
                <span class="switch-label-text">自动 WebDAV 备份</span>
              </div>
            </NFormItem>
            <NFormItem v-if="form.backupEnabled" label="备份间隔">
              <NSelect
                v-model:value="form.backupIntervalHours"
                :options="[
                  { label: '每 1 小时', value: 1 },
                  { label: '每 6 小时', value: 6 },
                  { label: '每 12 小时', value: 12 },
                  { label: '每天', value: 24 },
                  { label: '每 3 天', value: 72 },
                  { label: '每周', value: 168 },
                ]"
              />
            </NFormItem>
          </NForm>
        </div>

        <!-- 其它 -->
        <div class="settings-card">
          <div class="card-icon">🚀</div>
          <h3 class="card-title">下载加速</h3>
          <NForm :model="form" label-placement="top">
            <NFormItem>
              <div class="switch-row">
                <NSwitch v-model:value="form.ghProxyEnabled" />
                <span class="switch-label-text">GitHub 下载加速</span>
              </div>
            </NFormItem>
            <NFormItem v-if="form.ghProxyEnabled" label="加速代理地址">
              <NInput v-model:value="form.ghProxyUrl" placeholder="https://gh.api.99988866.xyz/" />
            </NFormItem>
            <p class="card-hint">
              使用 <a href="https://github.com/hunshcn/gh-proxy" target="_blank">gh-proxy</a> 加速下载 GitHub Release 文件
            </p>
          </NForm>
        </div>
      </div>

      <div class="form-actions">
        <button class="btn-primary btn-large" @click="doSave">保存设置</button>
      </div>
    </div>
  </AdminLayout>
</template>

<style scoped>
.settings-page { display: flex; flex-direction: column; gap: 16px; max-width: 760px; }
.page-title { margin: 0; font-size: 1.4rem; font-weight: 700; color: var(--text-main); }
.page-desc { margin: 0; font-size: 0.88rem; color: var(--text-tertiary); }

.settings-grid { display: flex; flex-direction: column; gap: 16px; }
.settings-card {
  background: var(--color-card);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 24px;
}
.card-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  background: var(--gradient-primary-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.3rem;
  margin-bottom: 8px;
}
.card-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0 0 12px;
}
.card-hint {
  font-size: 0.78rem;
  color: var(--text-tertiary);
  margin: 8px 0 0;
  line-height: 1.5;
}

.switch-row { display: flex; align-items: center; gap: 10px; }
.switch-label-text { font-size: 0.9rem; font-weight: 500; color: var(--text-main); }

.form-actions { display: flex; gap: 10px; padding-top: 8px; }
.btn-large { height: 44px; padding: 0 32px; font-size: 1rem; }
</style>
