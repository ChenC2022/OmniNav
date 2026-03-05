<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { apiFetch } from '@/utils/api'

const router = useRouter()
const route = useRoute()
const password = ref('')
const error = ref('')
const loading = ref(false)
const showSetPassword = ref(false)
const loginPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const setPasswordError = ref('')
const setPasswordLoading = ref(false)

const redirect = computed(() => {
  const r = route.query.redirect
  return typeof r === 'string' ? r : '/'
})

async function submit() {
  error.value = ''
  const pwd = password.value.trim()
  if (!pwd) {
    error.value = '请输入密码'
    return
  }
  loading.value = true
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd }),
      credentials: 'include',
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.ok) {
      if (data.firstLogin) {
        loginPassword.value = pwd
        showSetPassword.value = true
        newPassword.value = ''
        confirmPassword.value = ''
        setPasswordError.value = ''
        return
      }
      router.push(redirect.value)
      return
    }
    if (res.status === 429) {
      error.value = '尝试过于频繁，请稍后再试'
      return
    }
    if (res.status === 501) {
      error.value = '未配置主人密码'
      return
    }
    error.value = data?.error === 'Invalid password' ? '密码错误' : (data?.error || '登录失败')
  } finally {
    loading.value = false
  }
}

async function submitSetPassword() {
  setPasswordError.value = ''
  const newPwd = newPassword.value.trim()
  const confirm = confirmPassword.value.trim()
  if (!newPwd || newPwd.length < 4) {
    setPasswordError.value = '新密码至少 4 位'
    return
  }
  if (newPwd !== confirm) {
    setPasswordError.value = '两次输入不一致'
    return
  }
  setPasswordLoading.value = true
  try {
    const res = await apiFetch('/api/auth/set-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: loginPassword.value,
        newPassword: newPwd,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.ok) {
      router.push(redirect.value)
      return
    }
    setPasswordError.value = (data?.error as string) || '设置失败'
  } finally {
    setPasswordLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-[60vh] flex flex-col items-center justify-center px-4">
    <!-- 首次登录：设置新密码 -->
    <div
      v-if="showSetPassword"
      class="w-full max-w-sm rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur border border-slate-200 dark:border-white/10 p-6 shadow-lg"
    >
      <h1 class="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-1">首次登录</h1>
      <p class="text-sm text-slate-500 dark:text-slate-400 mb-6">请设置您的新密码，用于替代部署时配置的密码。</p>
      <form @submit.prevent="submitSetPassword" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">新密码</label>
          <input
            v-model="newPassword"
            type="password"
            autocomplete="new-password"
            class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/20 bg-slate-50 dark:bg-white/5 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
            placeholder="至少 4 位"
            :disabled="setPasswordLoading"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">确认新密码</label>
          <input
            v-model="confirmPassword"
            type="password"
            autocomplete="new-password"
            class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/20 bg-slate-50 dark:bg-white/5 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
            placeholder="再次输入"
            :disabled="setPasswordLoading"
          />
        </div>
        <p v-if="setPasswordError" class="text-sm text-red-500 dark:text-red-400">{{ setPasswordError }}</p>
        <button
          type="submit"
          class="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="setPasswordLoading"
        >
          {{ setPasswordLoading ? '设置中…' : '设置新密码并进入' }}
        </button>
      </form>
    </div>

    <!-- 登录表单 -->
    <div v-else class="w-full max-w-sm rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur border border-slate-200 dark:border-white/10 p-6 shadow-lg">
      <h1 class="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-1">OmniNav</h1>
      <p class="text-sm text-slate-500 dark:text-slate-400 mb-6">请输入主人密码</p>
      <form @submit.prevent="submit" class="space-y-4">
        <input
          v-model="password"
          type="password"
          autocomplete="current-password"
          class="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/20 bg-slate-50 dark:bg-white/5 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
          placeholder="密码"
          :disabled="loading"
        />
        <p v-if="error" class="text-sm text-red-500 dark:text-red-400">{{ error }}</p>
        <button
          type="submit"
          class="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="loading"
        >
          {{ loading ? '登录中…' : '登录' }}
        </button>
      </form>
    </div>
  </div>
</template>
