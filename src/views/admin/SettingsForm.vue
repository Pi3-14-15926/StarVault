<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { NInput, useMessage } from 'naive-ui'
import { useSettingStore } from '../../store/settings'
import AdminLayout from '../../components/admin/AdminLayout.vue'

const store = useSettingStore()
const message = useMessage()

const form = ref({
  siteName: '',
  logo: '',
  footer: '',
  admins: '',
})

onMounted(() => {
  store.refresh()
  const s = store.settings
  form.value = {
    siteName: s.siteName, logo: s.logo, footer: s.footer || '',
    admins: (s.admins || []).join(', '),
  }
})

function doSave() {
  const cur = store.settings
  store.save({
    ...cur,
    siteName: form.value.siteName,
    logo: form.value.logo,
    footer: form.value.footer || undefined,
    admins: form.value.admins.split(/[,，]/).map((a) => a.trim()).filter(Boolean),
  })
  message.success('设置已保存')
}
</script>

<template>
  <AdminLayout>
    <div class="settings-page">
      <div class="page-head">
        <div>
          <h2 class="page-title"><span class="page-title-emoji">⚙️</span>网站设置</h2>
          <p class="page-desc">配置站点品牌信息与定时任务</p>
        </div>
      </div>

      <!-- 网站配置：2 列 Grid -->
      <section class="settings-card">
        <header class="card-head">
          <div class="card-icon">🌐</div>
          <div>
            <h3 class="card-title">网站配置</h3>
            <p class="card-desc">配置站点的品牌展示信息</p>
          </div>
        </header>
        <div class="form-grid-2">
          <div class="field">
            <label class="field-label">网站名称</label>
            <NInput v-model:value="form.siteName" placeholder="Software Hub" size="large" />
          </div>
          <div class="field">
            <label class="field-label">Logo 链接</label>
            <NInput v-model:value="form.logo" placeholder="https://..." size="large" />
          </div>
          <div class="field field-full">
            <label class="field-label">页脚文字</label>
            <NInput v-model:value="form.footer" type="textarea" rows="2" placeholder="Powered by Software Hub" />
          </div>
          <div class="field field-full">
            <label class="field-label">管理员 GitHub 用户名</label>
            <NInput v-model:value="form.admins" placeholder="user1, user2" />
          </div>
        </div>
      </section>

      <!-- 定时任务已迁移至「功能设置」页面 -->

      <div class="form-actions">
        <button class="btn-primary btn-large" @click="doSave">保存设置</button>
      </div>
    </div>
  </AdminLayout>
</template>

<style scoped>
.settings-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  flex: 1;
  min-height: 0;
  padding-left: 25px;
  padding-right: 25px;
  margin-right: -3px;
}

/* === 通用卡片 === */
.settings-card {
  background: var(--admin-card);
  border: 1px solid var(--admin-border);
  border-radius: var(--admin-radius-card);
  box-shadow: var(--admin-shadow-card);
  padding: 24px;
  transition: box-shadow 0.25s ease, transform 0.25s ease;
}
.card-head {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 20px;
}
.card-icon {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: var(--admin-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.3rem;
  flex-shrink: 0;
  box-shadow: 0 6px 20px rgba(79, 140, 255, 0.28);
  color: #FFFFFF;
}
.card-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0 0 2px;
}
.card-desc {
  font-size: 0.85rem;
  color: var(--text-tertiary);
  margin: 0;
}
.card-hint {
  font-size: 0.8rem;
  color: var(--text-tertiary);
  margin: 12px 0 0;
  line-height: 1.6;
}
.card-hint a { color: var(--color-primary); font-weight: 500; }
.card-hint code {
  font-family: var(--font-mono);
  background: var(--color-card-soft);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 0.78rem;
  color: var(--color-primary);
}

/* === 2 列 Grid 表单 === */
.form-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.field { display: flex; flex-direction: column; gap: 6px; }
.field-full { grid-column: 1 / -1; }
.field-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-sec);
}

/* === 任务卡（HyperOS 风格） === */
.task-list { display: flex; flex-direction: column; gap: 12px; }
.task-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  background: var(--color-card-soft);
  border: 1px solid var(--admin-border);
  border-radius: 18px;
  transition: background 0.2s ease, border-color 0.2s ease;
}
.task-card:hover {
  background: #FFFFFF;
  border-color: var(--color-primary-soft);
}
.task-info { flex: 1; min-width: 0; }
.task-name {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 2px;
}
.task-desc {
  font-size: 0.82rem;
  color: var(--text-tertiary);
}
.task-interval {
  color: var(--color-primary);
  font-weight: 600;
  margin-left: 4px;
}
.task-control {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

/* === 开关卡 === */
.switch-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 22px;
  background: var(--color-card-soft);
  border: 1px solid var(--admin-border);
  border-radius: 18px;
  transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}
.switch-card.active {
  background: linear-gradient(135deg, rgba(79, 140, 255, 0.06), rgba(140, 108, 255, 0.06));
  border-color: rgba(79, 140, 255, 0.25);
  box-shadow: 0 4px 20px rgba(79, 140, 255, 0.08);
}
.switch-info { flex: 1; min-width: 0; }
.switch-name {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 2px;
}
.switch-desc {
  font-size: 0.82rem;
  color: var(--text-tertiary);
  line-height: 1.5;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 8px;
}
.btn-large { height: 48px; padding: 0 36px; font-size: 1rem; }

@media (max-width: 768px) {
  .settings-card { padding: 20px; border-radius: 20px; }
  .form-grid-2 { grid-template-columns: 1fr; }
  .field-full { grid-column: auto; }
  .task-card { flex-direction: column; align-items: flex-start; }
  .task-control { width: 100%; justify-content: space-between; }
  .form-actions { justify-content: stretch; }
  .form-actions .btn-primary { width: 100%; }
}
</style>
