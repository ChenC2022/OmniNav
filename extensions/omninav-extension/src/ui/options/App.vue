<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getBaseUrl, setBaseUrl, getSyncAt } from '../../shared/storage'

type ApiResp = { ok: boolean; error?: string; needInitialSetup?: boolean; data?: unknown }

const baseUrl = ref('')
const password = ref('')
const message = ref<string | null>(null)
const syncAt = ref<number | null>(null)
const hasPermission = ref<boolean | null>(null)

function toOriginPattern(raw: string): string | null {
  try {
    const u = new URL(raw.trim())
    return `${u.origin}/*`
  } catch {
    return null
  }
}

function fmtSyncAt(ts: number | null): string {
  if (!ts) return '上次同步：暂无'
  return `上次同步：${new Date(ts).toLocaleString()}`
}

async function refreshPermission() {
  const pattern = toOriginPattern(baseUrl.value)
  if (!pattern) { hasPermission.value = null; return }
  hasPermission.value = await chrome.permissions.contains({ origins: [pattern] })
}

onMounted(async () => {
  baseUrl.value = (await getBaseUrl()) ?? ''
  syncAt.value = await getSyncAt()
  await refreshPermission()
})

async function saveBaseUrl() {
  await setBaseUrl(baseUrl.value)
  message.value = '已保存 baseUrl'
  await refreshPermission()
}

async function requestPermission() {
  message.value = null
  const pattern = toOriginPattern(baseUrl.value)
  if (!pattern) {
    message.value = 'baseUrl 不是合法 URL（例如 https://xxx.pages.dev）'
    return
  }
  const granted = await chrome.permissions.request({ origins: [pattern] })
  await refreshPermission()
  message.value = granted ? '已授权该站点访问权限' : '未授权：没有权限将无法登录/同步'
}

async function login() {
  message.value = null
  await refreshPermission()
  const pattern = toOriginPattern(baseUrl.value)
  if (!pattern || !hasPermission.value) {
    message.value = '请先点击「授权站点权限」，否则浏览器可能会拦截请求'
    return
  }
  const r = (await chrome.runtime.sendMessage({ type: 'login', password: password.value })) as ApiResp
  if (!r?.ok) {
    message.value = r?.needInitialSetup ? '需要先在网页端完成首次设密' : (r?.error ?? '登录失败')
    return
  }
  message.value = '登录成功'
}

async function logout() {
  message.value = null
  const r = (await chrome.runtime.sendMessage({ type: 'logout' })) as ApiResp
  message.value = r?.ok ? '已退出' : (r?.error ?? '退出失败')
}

async function sync() {
  message.value = null
  const pattern = toOriginPattern(baseUrl.value)
  if (!pattern || !hasPermission.value) {
    message.value = '请先点击「授权站点权限」，否则浏览器可能会拦截请求'
    return
  }
  const r = (await chrome.runtime.sendMessage({ type: 'sync' })) as ApiResp
  if (!r?.ok) {
    message.value = r?.error ?? '同步失败（可能未登录或无权限）'
    return
  }
  syncAt.value = await getSyncAt()
  message.value = '同步成功'
}
</script>

<template>
  <div class="container">
    <h1 class="title">OmniNav 插件设置</h1>

    <div class="grid">
      <!-- baseUrl 配置 -->
      <div class="section">
        <label class="label">OmniNav baseUrl（你的 Pages 域名）</label>
        <input
          v-model="baseUrl"
          placeholder="https://xxx.pages.dev"
          class="input"
        />
        <div class="btn-row">
          <button class="btn btn-primary" @click="saveBaseUrl">保存</button>
          <button class="btn btn-outline" @click="requestPermission">授权站点权限</button>
        </div>
        <p v-if="hasPermission === true" class="permission-ok">站点权限：已授权</p>
        <p v-else-if="hasPermission === false" class="permission-fail">站点权限：未授权（将无法登录/同步）</p>
      </div>

      <!-- 登录区 -->
      <div class="card">
        <div class="card-title">登录</div>
        <div class="section-sm">
          <label class="label">密码</label>
          <input
            v-model="password"
            type="password"
            placeholder="你的 OmniNav 登录密码"
            class="input"
          />
        </div>
        <div class="btn-row">
          <button class="btn btn-primary" @click="login">登录</button>
          <button class="btn btn-outline" @click="logout">退出</button>
          <button class="btn btn-outline" @click="sync">立即同步</button>
        </div>
        <p class="sync-at">{{ fmtSyncAt(syncAt) }}</p>
      </div>

      <!-- 消息提示 -->
      <div v-if="message" class="message-box">{{ message }}</div>

      <!-- 说明 -->
      <div class="hint">
        <p>说明：</p>
        <p>- 站点访问权限采用可选授权（optional host permissions），只在你授权的 baseUrl 上生效。</p>
        <p>- 为控制权限风险，当前不使用 cookies 权限；登录态由 fetch 的 credentials 维持。</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.container {
  font-family: ui-sans-serif, system-ui, sans-serif;
  padding: 16px;
  max-width: 720px;
  color: var(--text, #111827);
  background: var(--bg, #fff);
  min-height: 100vh;
}
.title {
  font-size: 18px;
  margin: 0 0 16px;
  font-weight: 700;
}
.grid {
  display: grid;
  gap: 14px;
}
.section {
  display: grid;
  gap: 7px;
}
.section-sm {
  display: grid;
  gap: 6px;
}
.card {
  display: grid;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--border, #ddd);
  border-radius: 12px;
}
.card-title {
  font-weight: 600;
  font-size: 14px;
}
.label {
  font-size: 13px;
  color: var(--text-muted, #4b5563);
}
.input {
  padding: 8px 10px;
  border: 1px solid var(--border, #d1d5db);
  border-radius: 8px;
  font-size: 13px;
  background: var(--bg-input, #fafafa);
  color: var(--text, #111827);
  outline: none;
  width: 100%;
  box-sizing: border-box;
}
.input:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
}
.btn-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.btn {
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s;
}
.btn-primary {
  background: #4f46e5;
  border: 1px solid #4f46e5;
  color: white;
}
.btn-primary:hover { background: #4338ca; }
.btn-outline {
  background: var(--bg, white);
  border: 1px solid var(--border, #d1d5db);
  color: var(--text-muted, #374151);
}
.btn-outline:hover { background: var(--bg-muted, #f3f4f6); }
.permission-ok {
  font-size: 12px;
  color: #16a34a;
  margin: 0;
}
.permission-fail {
  font-size: 12px;
  color: #b45309;
  margin: 0;
}
.sync-at {
  font-size: 12px;
  color: var(--text-faint, #9ca3af);
  margin: 0;
}
.message-box {
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--msg-bg, #f6f6f6);
  border: 1px solid var(--msg-border, #e5e5e5);
  font-size: 13px;
  color: var(--text-muted, #4b5563);
}
.hint {
  font-size: 12px;
  color: var(--text-faint, #9ca3af);
  line-height: 1.7;
  display: grid;
  gap: 2px;
}
</style>
