<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { apiFetch } from '@/utils/api'

defineEmits<{ close: [] }>()

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const settings = useSettingsStore()
const messages = ref<ChatMessage[]>([])
const input = ref('')
const loading = ref(false)
const error = ref<string | null>(null)
const listEl = ref<HTMLElement | null>(null)

const isConfigured = computed(() => {
  const ai = settings.data.ai
  return !!(ai?.baseUrl?.trim() && ai?.model?.trim())
})

watch(
  () => messages.value.length,
  () => {
    nextTick(() => {
      listEl.value?.scrollTo({ top: listEl.value.scrollHeight, behavior: 'smooth' })
    })
  }
)

async function send() {
  const text = input.value.trim()
  if (!text || loading.value) return
  if (!isConfigured.value) {
    error.value = '请先在设置中配置 AI（Base URL、Model、API Key）'
    return
  }
  error.value = null
  messages.value.push({ role: 'user', content: text })
  input.value = ''
  loading.value = true
  try {
    const res = await apiFetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: messages.value.map((m) => ({ role: m.role, content: m.content })),
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const code = (data as { code?: string })?.code
      const msg = (data as { error?: string })?.error ?? '请求失败'
      if (code === 'AI_NOT_CONFIGURED') {
        error.value = 'AI 未配置，请到设置中填写 Base URL、Model 与 API Key。'
      } else {
        error.value = msg
      }
      return
    }
    const reply = (data as { message?: string })?.message ?? ''
    messages.value.push({ role: 'assistant', content: reply })
  } catch (e) {
    error.value = e instanceof Error ? e.message : '网络错误'
  } finally {
    loading.value = false
  }
}

function clearChat() {
  messages.value = []
  input.value = ''
  error.value = null
}

defineExpose({ clearChat })
</script>

<template>
  <div class="chat-panel flex flex-col h-full min-h-0">
    <div
      v-if="!isConfigured"
      class="chat-panel-notice p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 text-sm mx-6 mt-4"
    >
      尚未配置 AI。请前往
      <router-link to="/settings" class="underline font-medium text-primary" @click="$emit('close')">设置</router-link>
      填写 Base URL、Model 与 API Key。
    </div>
    <div
      v-else-if="error"
      class="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm mx-6 mt-4"
    >
      {{ error }}
    </div>

    <div ref="listEl" class="flex-1 overflow-auto p-6 space-y-6 min-h-0 custom-scrollbar">
      <template v-if="messages.length === 0 && !loading">
        <p class="chat-panel-empty text-slate-500 dark:text-slate-400 text-sm">输入消息开始对话。</p>
      </template>
      <template v-else>
        <div
          v-for="(msg, i) in messages"
          :key="i"
          class="flex gap-4"
          :class="msg.role === 'user' ? 'flex-row-reverse' : ''"
        >
          <div
            class="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center shadow-sm chat-panel-avatar"
            :class="msg.role === 'user' ? 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700' : 'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white'"
          >
            <span class="material-symbols-outlined text-sm">{{ msg.role === 'user' ? 'person' : 'auto_awesome' }}</span>
          </div>
          <div
            class="max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words border chat-panel-bubble"
            :class="
              msg.role === 'user'
                ? 'bg-indigo-500/10 border-indigo-400/20 text-slate-700 dark:text-slate-200 rounded-tr-none'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 rounded-tl-none chat-panel-assistant-bubble'
            "
          >
            {{ msg.content }}
          </div>
        </div>
        <div v-if="loading" class="flex gap-4">
          <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 shrink-0 flex items-center justify-center shadow-md text-white">
            <span class="material-symbols-outlined text-sm">auto_awesome</span>
          </div>
          <div class="chat-panel-loading rounded-2xl rounded-tl-none px-4 py-3 text-sm bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
            思考中…
          </div>
        </div>
      </template>
    </div>

    <form class="chat-panel-form p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800" @submit.prevent="send">
      <div class="relative">
        <textarea
          v-model="input"
          rows="3"
          class="chat-panel-input w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 pr-12 text-sm text-slate-900 dark:text-white focus:ring-indigo-400/50 focus:border-indigo-400 resize-none shadow-sm placeholder-slate-400"
          placeholder="问 AI 任何问题..."
          :disabled="loading || !isConfigured"
          @keydown="(e: KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }"
        />
        <button
          type="submit"
          class="absolute bottom-4 right-4 text-indigo-500 dark:text-indigo-400 hover:scale-110 transition-transform disabled:opacity-50 disabled:hover:scale-100"
          :disabled="loading || !input.trim() || !isConfigured"
          aria-label="发送"
        >
          <span class="material-symbols-outlined">send</span>
        </button>
      </div>
    </form>
  </div>
</template>
