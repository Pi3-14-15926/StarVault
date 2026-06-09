<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { NInput, NSwitch, NSelect, useMessage } from 'naive-ui'
import { useSettingStore } from '../../store/settings'
import AdminLayout from '../../components/admin/AdminLayout.vue'
import type { IconCdnMode } from '../../types'
import { describeCdn } from '../../utils/iconUrl'

const store = useSettingStore()
const message = useMessage()

const form = ref({
  ghProxyEnabled: false,
  ghProxyUrl: 'https://gh-proxy.com/',
  ghProxyCustomUrl: '',
  networkProxy: '',
  uploadProxy: '',
  iconCdnMode: 'jsdelivr' as IconCdnMode,
  iconCdnCustomBase: '',
})

const iconCdnOptions = [
  { label: 'jsDelivr（国内可用，推荐）', value: 'jsdelivr' },
  { label: 'Statically', value: 'statically' },
  { label: 'GitHack', value: 'githack' },
  { label: '自定义 Base URL', value: 'custom' },
  { label: '不使用加速', value: 'none' },
]

const ghProxyOptions = [
  { label: 'gh-proxy.com（推荐，Cloudflare 全球加速）', value: 'https://gh-proxy.com/' },
  { label: 'github.akams.cn（公益服务）', value: 'https://github.akams.cn/' },
  { label: 'githubproxy.cc（免费，多节点）', value: 'https://githubproxy.cc/' },
  { label: 'ghproxy.1888866.xyz（社区节点）', value: 'https://ghproxy.1888866.xyz/' },
  { label: '自定义代理地址', value: 'custom' },
]

onMounted(() => {
  store.refresh()
  const s = store.settings
  const proxyUrl = s.ghProxyUrl || ''
  const matchedPreset = ghProxyOptions.find(o => o.value !== 'custom' && o.value === proxyUrl)
  form.value = {
    ghProxyEnabled: s.ghProxyEnabled ?? false,
    ghProxyUrl: matchedPreset ? proxyUrl : (proxyUrl ? 'custom' : 'https://gh-proxy.com/'),
    ghProxyCustomUrl: matchedPreset ? '' : proxyUrl,
    networkProxy: s.networkProxy || '',
    uploadProxy: s.uploadProxy || '',
    iconCdnMode: s.iconCdnMode || 'jsdelivr',
    iconCdnCustomBase: s.iconCdnCustomBase || '',
  }
})

function doSave() {
  const s = { ...store.settings }
  s.ghProxyEnabled = form.value.ghProxyEnabled
  const selected = form.value.ghProxyUrl
  if (selected === 'custom') {
    s.ghProxyUrl = form.value.ghProxyCustomUrl || undefined
  } else {
    s.ghProxyUrl = selected || undefined
  }
  s.networkProxy = form.value.networkProxy || undefined
  s.uploadProxy = form.value.uploadProxy || undefined
  s.iconCdnMode = form.value.iconCdnMode
  s.iconCdnCustomBase = form.value.iconCdnCustomBase || undefined
  store.save(s)
  message.success('设置已保存')
}
</script>

<template>
  <AdminLayout>
    <div class="accel-page">
      <div class="page-head">
        <div>
          <h2 class="page-title"><span class="page-title-emoji">⚡</span>加速设置</h2>
          <p class="page-desc">配置下载加速代理和图标 CDN 镜像，让国内访问更顺畅</p>
        </div>
      </div>

      <!-- 下载加速：开关卡 + 输入框 -->
      <section class="settings-card">
        <header class="card-head">
          <div class="card-icon">🚀</div>
          <div>
            <h3 class="card-title">下载加速</h3>
            <p class="card-desc">使用 gh-proxy 加速下载 GitHub Release 文件</p>
          </div>
        </header>

        <div class="switch-card" :class="{ active: form.ghProxyEnabled }">
          <div class="switch-info">
            <div class="switch-name">GitHub 代理加速</div>
            <div class="switch-desc">开启后所有 GitHub Release 下载链接将通过代理服务转发</div>
          </div>
          <NSwitch v-model:value="form.ghProxyEnabled" size="large" />
        </div>

        <div v-if="form.ghProxyEnabled" class="field" style="margin-top: 16px;">
          <label class="field-label">加速代理</label>
          <NSelect v-model:value="form.ghProxyUrl" :options="ghProxyOptions" size="large" />
        </div>
        <div v-if="form.ghProxyEnabled && form.ghProxyUrl === 'custom'" class="field" style="margin-top: 12px;">
          <label class="field-label">自定义代理地址</label>
          <NInput v-model:value="form.ghProxyCustomUrl" placeholder="https://your-proxy.example.com/" size="large" />
        </div>

        <p class="card-hint">
          内置多个公益加速节点，也可以自行部署
          <a href="https://github.com/hunshcn/gh-proxy" target="_blank" rel="noopener">gh-proxy</a>。
          配置后所有 <code>github.com</code> 下载链接会自动通过代理转发。
        </p>
      </section>

      <!-- 网络代理 -->
      <section class="settings-card">
        <header class="card-head">
          <div class="card-icon" style="background: linear-gradient(135deg, #f59e0b, #fb923c); box-shadow: 0 6px 20px rgba(245, 158, 11, 0.28);">🌐</div>
          <div>
            <h3 class="card-title">网络代理</h3>
            <p class="card-desc">配置本地代理，用于 rclone 连接 Google Drive 等境外服务</p>
          </div>
        </header>

        <div class="field">
          <label class="field-label">代理地址</label>
          <NInput v-model:value="form.networkProxy" placeholder="http://127.0.0.1:10808" size="large" />
        </div>

        <p class="card-hint">
          用于 rclone 连接 Google Drive、OneDrive 等需要翻墙的服务。
          留空则默认使用 <code>http://127.0.0.1:10808</code>（V2Ray 默认端口）。
          设置后需重启 dev server 生效。
        </p>
      </section>

      <!-- 上传代理 -->
      <section class="settings-card">
        <header class="card-head">
          <div class="card-icon" style="background: linear-gradient(135deg, #10b981, #059669); box-shadow: 0 6px 20px rgba(16, 185, 129, 0.28);">📤</div>
          <div>
            <h3 class="card-title">上传代理</h3>
            <p class="card-desc">配置上传代理，用于 Actions 同步并备份脚本上传 WebDAV 文件走代理连接国内 123 云盘服务器</p>
          </div>
        </header>

        <div class="field">
          <label class="field-label">代理地址</label>
          <NInput v-model:value="form.uploadProxy" placeholder="http://your-proxy.example.com:8888" size="large" />
        </div>

        <p class="card-hint">
          GitHub Actions runner 位于境外，直连国内 123 云盘 WebDAV 可能受限。
          配置代理地址后，rclone 上传文件会通过该代理中转。
          适用于自建代理服务器或第三方代理服务（如 HTTP/SOCKS5 代理）。
          留空则直连（不使用代理）。
        </p>
      </section>

      <!-- 图标 CDN 加速：开关卡 + 下拉 -->
      <section class="settings-card">
        <header class="card-head">
          <div class="card-icon">🌍</div>
          <div>
            <h3 class="card-title">图标 CDN 加速</h3>
            <p class="card-desc">让所有 GitHub raw 图片自动走更快镜像，国内访问更顺畅</p>
          </div>
        </header>

        <div class="form-grid-2">
          <div class="field field-full">
            <label class="field-label">加速策略</label>
            <NSelect v-model:value="form.iconCdnMode" :options="iconCdnOptions" size="large" />
            <p class="card-hint" style="margin-top: 8px;">
              当前选择：<strong style="color: var(--color-primary);">{{ describeCdn(form.iconCdnMode) }}</strong>
            </p>
          </div>
          <div v-if="form.iconCdnMode === 'custom'" class="field field-full">
            <label class="field-label">自定义 Base URL</label>
            <NInput v-model:value="form.iconCdnCustomBase" placeholder="https://your-cdn.example.com/" size="large" />
            <p class="card-hint" style="margin-top: 8px;">
              最终 URL 形如：<code>{{ form.iconCdnCustomBase || 'https://your-cdn.example.com/' }}raw.githubusercontent.com/owner/repo/branch/path</code>
            </p>
          </div>
        </div>

        <p class="card-hint">
          配置后 <code>raw.githubusercontent.com</code> 域名的图标 URL 会自动替换为更快镜像。
          GitHub 仓库配置（owner/repo/token）请到
          <a href="/admin/icons" style="color: var(--color-primary); font-weight: 600;">图标管理</a>
          页面填写。
        </p>
      </section>

      <div class="form-actions">
        <button class="btn-primary btn-large" @click="doSave">保存设置</button>
      </div>
    </div>
  </AdminLayout>
</template>

<style scoped>
.accel-page {
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
  .form-actions { justify-content: stretch; }
  .form-actions .btn-primary { width: 100%; }
}
</style>
