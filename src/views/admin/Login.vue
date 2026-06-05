<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { NInput, NButton, useMessage } from 'naive-ui'
import { validateToken, saveLogin, isAuthenticated } from '../../utils/auth'
import { getSettings, saveSettings } from '../../utils/api'

const router = useRouter()
const message = useMessage()

const token = ref('')
const loading = ref(false)
const errorMsg = ref('')

if (isAuthenticated()) {
  router.replace('/admin/dashboard')
}

async function doLogin() {
  const trimmed = token.value.trim()
  if (!trimmed) {
    errorMsg.value = '请输入 GitHub Token'
    return
  }
  loading.value = true
  errorMsg.value = ''
  try {
    const user = await validateToken(trimmed)
    const settings = getSettings()
    const admins = settings.admins || []

    if (admins.length === 0) {
      settings.admins = [user.login]
      saveSettings(settings)
      message.success(`"${user.login}" 已自动注册为管理员`)
    } else if (!admins.includes(user.login)) {
      throw new Error(`"${user.login}" 不是管理员，无权访问后台`)
    }

    saveLogin(trimmed, user)
    message.success('登录成功')
    router.replace('/admin/dashboard')
  } catch (e: any) {
    errorMsg.value = e.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card glass-card">
      <div class="login-header">
        <div class="login-icon">🐺</div>
        <h1 class="login-title">管理后台登录</h1>
        <p class="login-desc">使用 GitHub Personal Access Token 登录</p>
      </div>

      <div v-if="errorMsg" class="error-banner">
        <span>⚠️</span>
        <span>{{ errorMsg }}</span>
      </div>

      <div class="form-field">
        <label class="form-label">GitHub Token</label>
        <NInput
          v-model:value="token"
          type="password"
          show-password-on="click"
          placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
          :disabled="loading"
          size="large"
          @keyup.enter="doLogin"
        />
      </div>

      <button
        class="btn-primary login-btn"
        :disabled="loading"
        @click="doLogin"
      >
        {{ loading ? '验证中...' : '登录' }}
      </button>

      <div class="login-hint">
        <p class="hint-title">Token 需要以下权限：</p>
        <ul>
          <li><code>public_repo</code> — 读取公开仓库 Release</li>
          <li><code>repo</code> — 同步私有仓库</li>
        </ul>
        <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" class="hint-link">
          → 创建 Token
        </a>
      </div>
    </div>

    <div class="login-decoration" aria-hidden="true">
      <div class="deco-orb deco-orb-1"></div>
      <div class="deco-orb deco-orb-2"></div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg);
  padding: 20px;
  overflow: hidden;
}

.login-card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 420px;
  padding: 32px;
}

.login-header {
  text-align: center;
  margin-bottom: 24px;
}
.login-icon {
  width: 56px;
  height: 56px;
  margin: 0 auto 12px;
  border-radius: var(--radius-lg);
  background: var(--gradient-primary-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.8rem;
}
.login-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0 0 6px;
}
.login-desc {
  font-size: 0.85rem;
  color: var(--text-tertiary);
  margin: 0;
}

.error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  margin-bottom: 16px;
  background: rgba(255, 107, 107, 0.08);
  color: var(--color-error);
  border: 1px solid rgba(255, 107, 107, 0.2);
  border-radius: var(--radius-md);
  font-size: 0.85rem;
}

.form-field {
  margin-bottom: 16px;
}
.form-label {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-sec);
  margin-bottom: 6px;
}

.login-btn {
  width: 100%;
  height: 44px;
  font-size: 0.95rem;
  margin-bottom: 20px;
}

.login-hint {
  font-size: 0.82rem;
  color: var(--text-sec);
  line-height: 1.6;
  background: var(--color-card-soft);
  padding: 14px 16px;
  border-radius: var(--radius-md);
}
.hint-title { margin: 0 0 4px; font-weight: 600; color: var(--text-main); }
.login-hint ul {
  margin: 4px 0;
  padding-left: 20px;
}
.login-hint code {
  font-size: 0.78rem;
  background: var(--color-card);
  padding: 1px 6px;
  border-radius: 4px;
  font-family: var(--font-mono);
  color: var(--color-primary);
}
.hint-link {
  display: inline-block;
  margin-top: 4px;
  color: var(--color-primary);
  font-weight: 500;
}

.login-decoration {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.deco-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.5;
}
.deco-orb-1 {
  width: 400px;
  height: 400px;
  top: -100px;
  right: -100px;
  background: radial-gradient(circle, rgba(140, 108, 255, 0.4) 0%, transparent 70%);
}
.deco-orb-2 {
  width: 350px;
  height: 350px;
  bottom: -120px;
  left: -80px;
  background: radial-gradient(circle, rgba(52, 120, 246, 0.4) 0%, transparent 70%);
}
</style>
