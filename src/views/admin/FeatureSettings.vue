<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { NInput, NInputNumber, NSwitch, NSelect, useMessage } from 'naive-ui'
import AdminLayout from '../../components/admin/AdminLayout.vue'
import { useSettingStore } from '../../store/settings'
import { encryptSecret, decryptSecret, isEncrypted } from '../../utils/secretStore'

const store = useSettingStore()
const message = useMessage()

/* ============== 定时任务 ============== */
const taskForm = ref({
  syncEnabled: false,
  syncIntervalHours: 6,
  backupEnabled: false,
  backupIntervalHours: 24,
})
const intervalOptions = [
  { label: '每 1 小时', value: 1 },
  { label: '每 6 小时', value: 6 },
  { label: '每 12 小时', value: 12 },
  { label: '每天', value: 24 },
]
const backupIntervalOptions = [
  { label: '每 1 小时', value: 1 },
  { label: '每 6 小时', value: 6 },
  { label: '每 12 小时', value: 12 },
  { label: '每天', value: 24 },
  { label: '每 3 天', value: 72 },
  { label: '每周', value: 168 },
]
function intervalLabel(list: { label: string; value: number }[], v: number) {
  return list.find((o) => o.value === v)?.label || `${v} 小时`
}
function saveTask() {
  const cur = store.settings
  store.save({
    ...cur,
    schedule: {
      ...(cur.schedule || {}),
      syncEnabled: taskForm.value.syncEnabled,
      syncIntervalHours: taskForm.value.syncIntervalHours,
      backupEnabled: taskForm.value.backupEnabled,
      backupIntervalHours: taskForm.value.backupIntervalHours,
    },
  })
  message.success('定时任务已保存')
}

/* ============== Web 备份设置 ============== */
const webForm = ref({
  url: '',
  username: '',
  password: '',
  baseDir: '/SoftwareHub',
  uploadTimeout: 300,
  maxFileSize: 500,
})
const showPassword = ref(false)
const testing = ref(false)
const testResult = ref<{ ok: boolean; msg: string; count?: number } | null>(null)

const webdavConfigured = computed(() =>
  !!(webForm.value.url && webForm.value.username && webForm.value.password),
)

onMounted(async () => {
  store.refresh()
  const sc = store.settings.schedule
  taskForm.value = {
    syncEnabled: sc?.syncEnabled ?? false,
    syncIntervalHours: sc?.syncIntervalHours ?? 6,
    backupEnabled: sc?.backupEnabled ?? false,
    backupIntervalHours: sc?.backupIntervalHours ?? 24,
  }
  const wd = store.settings.webdav
  const storedPwd = wd?.password ?? ''
  // 兼容老明文 + 新密文
  const plainPwd = isEncrypted(storedPwd) ? await decryptSecret(storedPwd) : storedPwd
  webForm.value = {
    url: wd?.url ?? '',
    username: wd?.username ?? '',
    password: plainPwd,
    baseDir: wd?.baseDir ?? '/SoftwareHub',
    uploadTimeout: wd?.uploadTimeout ?? 300,
    maxFileSize: wd?.maxFileSize ?? 500,
  }
})

async function saveWebdavConfig() {
  const s = { ...store.settings }
  s.webdav = {
    ...(s.webdav || {}),
    url: webForm.value.url,
    username: webForm.value.username,
    password: webForm.value.password ? await encryptSecret(webForm.value.password) : '',
    baseDir: webForm.value.baseDir,
  }
  store.save(s)
  message.success('WebDAV 配置已保存')
}

function saveUploadConfig() {
  const s = { ...store.settings }
  s.webdav = {
    ...(s.webdav || {}),
    uploadTimeout: webForm.value.uploadTimeout,
    maxFileSize: webForm.value.maxFileSize,
  } as any
  store.save(s)
  message.success('上传设置已保存')
}

async function testConnection() {
  if (!webForm.value.url || !webForm.value.username || !webForm.value.password) {
    testResult.value = { ok: false, msg: '请先填写完整的服务地址、用户名、密码' }
    return
  }
  testing.value = true
  testResult.value = null
  try {
    if (!import.meta.env.DEV) {
      testResult.value = { ok: false, msg: '测试连接仅在本地开发环境可用（生产环境请直接进入「备份管理」查看 manifest）' }
      testing.value = false
      return
    }
    const cfgRes = await fetch('/__backup-webdav-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webForm.value.url,
        username: webForm.value.username,
        password: webForm.value.password,
        baseDir: webForm.value.baseDir,
      }),
    })
    if (!cfgRes.ok) throw new Error('配置同步失败')
    const listRes = await fetch('/__backup-files')
    if (!listRes.ok) throw new Error(`连接失败 (HTTP ${listRes.status})`)
    const data = await listRes.json()
    const count = Array.isArray(data.entries) ? data.entries.length : 0
    testResult.value = { ok: true, msg: '连接成功', count }
  } catch (e: any) {
    testResult.value = { ok: false, msg: e.message || '连接失败' }
  }
  testing.value = false
}
</script>

<template>
  <AdminLayout>
    <div class="features-page">
      <div class="page-head">
        <div>
          <h2 class="page-title"><span class="page-title-emoji">🛠️</span>功能设置</h2>
          <p class="page-desc">按功能分类的可选配置项</p>
        </div>
      </div>

      <!-- 导入导出 已迁移至「统计概览」页面 -->

      <!-- 定时任务 -->
      <section class="settings-card">
        <header class="card-head">
          <div class="card-icon">⏰</div>
          <div>
            <h3 class="card-title">定时任务</h3>
            <p class="card-desc">在 GitHub Actions 上自动执行同步与备份</p>
          </div>
        </header>

        <div class="task-list">
          <div class="task-card">
            <div class="task-info">
              <div class="task-name">Release 同步</div>
              <div class="task-desc">
                拉取所有 GitHub 项目的最新 Release 信息
                <span v-if="taskForm.syncEnabled" class="task-interval">· {{ intervalLabel(intervalOptions, taskForm.syncIntervalHours) }}</span>
              </div>
            </div>
            <div class="task-control">
              <NSelect
                v-if="taskForm.syncEnabled"
                v-model:value="taskForm.syncIntervalHours"
                :options="intervalOptions"
                size="small"
                style="width: 120px;"
              />
              <NSwitch v-model:value="taskForm.syncEnabled" />
            </div>
          </div>

          <div class="task-card">
            <div class="task-info">
              <div class="task-name">WebDAV 备份</div>
              <div class="task-desc">
                将 Release 文件备份到 WebDAV 云盘
                <span v-if="taskForm.backupEnabled" class="task-interval">· {{ intervalLabel(backupIntervalOptions, taskForm.backupIntervalHours) }}</span>
              </div>
            </div>
            <div class="task-control">
              <NSelect
                v-if="taskForm.backupEnabled"
                v-model:value="taskForm.backupIntervalHours"
                :options="backupIntervalOptions"
                size="small"
                style="width: 120px;"
              />
              <NSwitch v-model:value="taskForm.backupEnabled" />
            </div>
          </div>
        </div>

        <div class="card-actions">
          <button class="btn-primary" @click="saveTask">保存</button>
        </div>
      </section>

      <!-- Web 备份设置 -->
      <section class="settings-card">
        <header class="card-head">
          <div class="card-icon">☁️</div>
          <div>
            <h3 class="card-title">Web 备份设置</h3>
            <p class="card-desc">配置 WebDAV 云盘连接 + 控制上传行为</p>
          </div>
        </header>

        <!-- WebDAV 配置 -->
        <div class="webdav-section">
          <div class="subsection-head">
            <h4 class="subsection-title">WebDAV 配置</h4>
            <span
              class="status-tag"
              :class="webdavConfigured ? 'status-ok' : 'status-miss'"
            >
              <span class="status-dot"></span>
              {{ webdavConfigured ? '已配置' : '未配置' }}
            </span>
          </div>

          <div class="form-grid-2">
            <div class="field">
              <label class="field-label">服务地址</label>
              <NInput
                v-model:value="webForm.url"
                placeholder="https://dav.jianguoyun.com/dav/"
                size="large"
              />
              <span class="hint-text">WebDAV 服务器 URL</span>
            </div>
            <div class="field">
              <label class="field-label">基础目录</label>
              <NInput
                v-model:value="webForm.baseDir"
                placeholder="/SoftwareHub"
                size="large"
              />
              <span class="hint-text">云盘上存放备份的子目录</span>
            </div>
            <div class="field">
              <label class="field-label">用户名</label>
              <NInput
                v-model:value="webForm.username"
                placeholder="WebDAV 账号"
                size="large"
              />
            </div>
            <div class="field">
              <label class="field-label">密码</label>
              <NInput
                v-model:value="webForm.password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="WebDAV 密码"
                size="large"
              >
                <template #suffix>
                  <button
                    type="button"
                    class="pwd-toggle"
                    @click="showPassword = !showPassword"
                  >
                    {{ showPassword ? '隐藏' : '显示' }}
                  </button>
                </template>
              </NInput>
            </div>
          </div>

          <p class="webdav-hint">
            💡 配置完成后，<a href="/admin/backup-files" class="link">备份管理</a>页面即可读取云盘上的文件列表。
            <br />
            🔒 密码使用浏览器内置 <code>AES-GCM 256</code> 加密后存储；同源 XSS 仍可解密，敏感环境请使用专用账号 + 限 IP。
          </p>

          <div class="webdav-actions">
            <button class="btn-primary" @click="saveWebdavConfig">保存配置</button>
            <button class="btn-secondary" :disabled="testing" @click="testConnection">
              {{ testing ? '测试中...' : '测试连接' }}
            </button>
          </div>
          <div
            v-if="testResult"
            class="test-result"
            :class="testResult.ok ? 'test-ok' : 'test-err'"
          >
            <span class="test-icon">{{ testResult.ok ? '✓' : '✗' }}</span>
            <span>{{ testResult.msg }}<span v-if="testResult.count != null"> · 列出 {{ testResult.count }} 个备份项</span></span>
          </div>
        </div>

        <div class="divider"></div>

        <div class="form-grid-2">
          <div class="field">
            <label class="field-label">上传超时</label>
            <NInputNumber v-model:value="webForm.uploadTimeout" :min="10" :max="1800" size="large" style="width: 100%;" />
            <span class="hint-text">秒（默认 300）</span>
          </div>
          <div class="field">
            <label class="field-label">文件限制</label>
            <NInputNumber v-model:value="webForm.maxFileSize" :min="1" :max="10000" size="large" style="width: 100%;" />
            <span class="hint-text">MB（默认 500）</span>
          </div>
        </div>

        <div class="card-actions">
          <button class="btn-primary" @click="saveUploadConfig">保存</button>
        </div>
      </section>
    </div>
  </AdminLayout>
</template>

<style scoped>
.features-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  flex: 1;
  min-height: 0;
  padding-left: 25px;
  padding-right: 25px;
  margin-right: -3px;
}

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
  gap: 12px;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--admin-border);
}
.card-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.3rem;
  flex-shrink: 0;
  background: rgba(52, 120, 246, 0.12);
}
.card-icon.io { background: rgba(140, 108, 255, 0.12); }
.card-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0 0 2px;
}
.card-desc {
  font-size: 0.82rem;
  color: var(--text-tertiary);
  margin: 0;
}

/* === Web 备份设置 === */
.form-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.webdav-section {
  background: var(--color-card-soft);
  border: 1px solid var(--admin-border);
  border-radius: 16px;
  padding: 20px 22px;
  margin-bottom: 8px;
}
.subsection-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.subsection-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
}
.status-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.76rem;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 999px;
}
.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-ok {
  color: var(--color-success);
  background: rgba(60, 179, 113, 0.12);
}
.status-ok .status-dot {
  background: var(--color-success);
  box-shadow: 0 0 6px var(--color-success);
}
.status-miss {
  color: var(--color-warning);
  background: rgba(240, 160, 32, 0.12);
}
.status-miss .status-dot {
  background: var(--color-warning);
  box-shadow: 0 0 6px var(--color-warning);
}
.pwd-toggle {
  background: transparent;
  border: 0;
  padding: 2px 6px;
  font-size: 0.78rem;
  color: var(--color-primary);
  cursor: pointer;
  font-weight: 600;
  border-radius: 4px;
  transition: background 0.15s ease;
}
.pwd-toggle:hover { background: rgba(79, 140, 255, 0.1); }
.webdav-hint {
  margin: 14px 0 0;
  padding: 10px 14px;
  background: rgba(79, 140, 255, 0.06);
  border: 1px solid rgba(79, 140, 255, 0.18);
  border-radius: 10px;
  font-size: 0.82rem;
  color: var(--text-sec);
  line-height: 1.5;
}
.webdav-hint .link {
  color: var(--color-primary);
  text-decoration: none;
  font-weight: 600;
}
.webdav-hint .link:hover { text-decoration: underline; }
.divider {
  height: 1px;
  background: var(--admin-border);
  margin: 20px 0;
}
.webdav-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-top: 18px;
  flex-wrap: wrap;
}
.test-result {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 0.86rem;
  font-weight: 500;
  line-height: 1.5;
}
.test-ok {
  color: var(--color-success);
  background: rgba(60, 179, 113, 0.08);
  border: 1px solid rgba(60, 179, 113, 0.22);
}
.test-err {
  color: var(--color-error, #E55353);
  background: rgba(229, 83, 83, 0.08);
  border: 1px solid rgba(229, 83, 83, 0.22);
}
.test-icon {
  font-size: 1rem;
  font-weight: 700;
  flex-shrink: 0;
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
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-sec);
}
.hint-text {
  font-size: 0.78rem;
  color: var(--text-tertiary);
}

.card-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-top: 20px;
}

@media (max-width: 768px) {
  .form-grid-2 { grid-template-columns: 1fr; }
  .task-card { flex-direction: column; align-items: flex-start; }
  .task-control { width: 100%; justify-content: space-between; }
}
</style>
