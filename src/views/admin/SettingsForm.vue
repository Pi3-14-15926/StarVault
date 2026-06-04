<script setup lang="ts">
/* ===== 网站设置 ===== */
import { ref, onMounted } from 'vue'
import { NButton, NInput, NSwitch, NSelect, NCard, NForm, NFormItem, useMessage } from 'naive-ui'
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
    siteName: s.siteName,
    logo: s.logo,
    footer: s.footer || '',
    admins: (s.admins || []).join(', '),
    storageNote: s.storageNote || '',
    ghProxyEnabled: s.ghProxyEnabled ?? false,
    ghProxyUrl: s.ghProxyUrl || '',
    syncEnabled: sc?.syncEnabled ?? false,
    syncIntervalHours: sc?.syncIntervalHours ?? 6,
    backupEnabled: sc?.backupEnabled ?? false,
    backupIntervalHours: sc?.backupIntervalHours ?? 24,
  }
})

function doSave() {
  store.save({
    siteName: form.value.siteName,
    logo: form.value.logo,
    footer: form.value.footer || undefined,
    admins: form.value.admins
      .split(/[,，]/)
      .map((a) => a.trim())
      .filter(Boolean),
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
    <h2 class="page-title">⚙️ 网站设置</h2>

    <NCard title="网站配置" class="form-card">
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
    </NCard>

    <NCard title="定时设置" class="form-card" style="margin-top:16px">
      <NForm :model="form" label-placement="top">
        <NFormItem label="自动同步 GitHub">
          <NSwitch v-model:value="form.syncEnabled" />
          <span style="margin-left:10px;font-size:0.85rem;color:var(--text-sec)">
            {{ form.syncEnabled ? '已开启' : '已关闭' }}
          </span>
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

        <NFormItem label="自动 WebDAV 备份">
          <NSwitch v-model:value="form.backupEnabled" />
          <span style="margin-left:10px;font-size:0.85rem;color:var(--text-sec)">
            {{ form.backupEnabled ? '已开启' : '已关闭' }}
          </span>
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
    </NCard>

    <NCard title="其它" class="form-card" style="margin-top:16px">
      <NForm :model="form" label-placement="top">
        <NFormItem label="GitHub 下载加速">
          <NSwitch v-model:value="form.ghProxyEnabled" />
          <span style="margin-left:10px;font-size:0.85rem;color:var(--text-sec)">
            {{ form.ghProxyEnabled ? '已开启' : '已关闭' }}
          </span>
        </NFormItem>
        <NFormItem v-if="form.ghProxyEnabled" label="加速代理地址">
          <NInput v-model:value="form.ghProxyUrl" placeholder="https://gh.api.99988866.xyz/" />
          <template #feedback>
            使用 <a href="https://github.com/hunshcn/gh-proxy" target="_blank">gh-proxy</a> 加速下载 GitHub Release 文件，默认使用公共加速节点
          </template>
        </NFormItem>
      </NForm>
    </NCard>

    <div class="form-actions">
      <NButton type="primary" size="large" @click="doSave">保存设置</NButton>
    </div>
  </AdminLayout>
</template>

<style scoped>
.page-title { margin: 0 0 20px; font-size: 1.3rem; }
.form-card { max-width: 680px; }
.form-actions { margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--border-color); }
@media (max-width: 768px) { .form-card { max-width: 100%; } }
</style>
