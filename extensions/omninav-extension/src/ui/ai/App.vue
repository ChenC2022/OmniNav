<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { apiFetch } from '../../shared/api'

type Message = { role: 'user' | 'assistant'; content: string }
type Usage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
type ChatResp = { ok: boolean; message?: string; usage?: Usage; error?: string; code?: string }

const history = ref<Message[]>([])
const isLoading = ref(false)
const input = ref('')
const errorMsg = ref<string | null>(null)
const usageText = ref<string | null>(null)
const chatListEl = ref<HTMLElement | null>(null)

function renderMarkdown(content: string): string {
  if (!content?.trim()) return ''
  const rawHtml = marked.parse(content, { async: false }) as string
  DOMPurify.addHook('afterSanitizeElements', (node) => {
    if ((node as Element).tagName === 'A') {
      (node as Element).setAttribute('target', '_blank')
      ;(node as Element).setAttribute('rel', 'noopener noreferrer')
    }
  })
  const out = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: ['p','br','strong','b','em','i','u','s','a','ul','ol','li',
                   'h1','h2','h3','h4','code','pre','blockquote','hr','span'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
  })
  DOMPurify.removeHook('afterSanitizeElements')
  return out
}

watch(
  () => history.value.length,
  () => {
    nextTick(() => {
      if (chatListEl.value) {
        chatListEl.value.scrollTop = chatListEl.value.scrollHeight
      }
    })
  }
)

async function send() {
  const text = input.value.trim()
  if (!text || isLoading.value) return

  input.value = ''
  history.value.push({ role: 'user', content: text })
  isLoading.value = true
  errorMsg.value = null

  const r = await apiFetch<ChatResp>('/api/ai/chat', {
    method: 'POST',
    body: JSON.stringify({ messages: history.value }),
  })

  isLoading.value = false

  if (!r.ok) {
    history.value.pop()
    const errMsg = (r as { error?: string }).error ?? '请求失败'
    const isNotCfg = (r as { code?: string }).code === 'AI_NOT_CONFIGURED' || errMsg.includes('AI 未配置')
    errorMsg.value = isNotCfg
      ? '⚠️ AI 未配置，请前往 OmniNav 网页端「设置 → AI 配置」填写 baseUrl / model / apiKey。'
      : `❌ ${errMsg}`
    return
  }

  const resp = r as unknown as ChatResp
  const replyText = resp.message ?? '（未收到回复内容）'
  history.value.push({ role: 'assistant', content: replyText })

  const usage = resp.usage
  if (usage) {
    usageText.value = `本次用量：提示词 ${usage.prompt_tokens ?? '-'} tokens，补全 ${usage.completion_tokens ?? '-'} tokens，合计 ${usage.total_tokens ?? '-'} tokens`
  }
}

function clearChat() {
  history.value = []
  input.value = ''
  errorMsg.value = null
  usageText.value = null
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    void send()
  }
}
</script>

<template>
  <div class="chat-root">
    <!-- 顶栏 -->
    <div class="topbar">
      <div class="topbar-left">
        <img src="/logo.svg" alt="OmniNav" class="logo" />
        <span class="title">OmniNav AI</span>
        <span class="badge">书签助手</span>
      </div>
      <button class="btn-clear" @click="clearChat">清空对话</button>
    </div>

    <!-- 对话列表 -->
    <div ref="chatListEl" class="chat-list">
      <!-- 欢迎页 -->
      <div v-if="history.length === 0 && !isLoading" class="welcome">
        <img src="/logo.svg" alt="OmniNav" class="welcome-logo" />
        <div class="welcome-title">你好！我是 OmniNav 书签助手</div>
        <div class="welcome-desc">
          我了解你收藏的所有书签。<br />
          你可以问我：<em>「帮我找一下关于 Vue 的书签」</em>，<br />
          或者：<em>「我收藏了哪些设计相关的网站？」</em>
        </div>
      </div>

      <!-- 消息气泡 -->
      <template v-else>
        <div
          v-for="(msg, i) in history"
          :key="i"
          class="bubble-row"
          :class="msg.role === 'user' ? 'bubble-row-user' : 'bubble-row-ai'"
        >
          <img v-if="msg.role === 'assistant'" src="/logo.svg" alt="OmniNav" class="avatar-ai" />
          <div
            class="bubble"
            :class="msg.role === 'user' ? 'bubble-user' : 'bubble-ai md'"
            v-html="msg.role === 'user'
              ? msg.content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br/>')
              : renderMarkdown(msg.content)"
          />
          <div v-if="msg.role === 'user'" class="avatar-user">🙂</div>
        </div>

        <!-- 加载中气泡 -->
        <div v-if="isLoading" class="bubble-row bubble-row-ai">
          <img src="/logo.svg" alt="OmniNav" class="avatar-ai" />
          <div class="bubble bubble-ai loading-bubble">
            <span class="dot" style="animation-delay:0s">●</span>
            <span class="dot" style="animation-delay:.4s">●</span>
            <span class="dot" style="animation-delay:.8s">●</span>
          </div>
        </div>
      </template>
    </div>

    <!-- usage 条 -->
    <div v-if="usageText" class="usage-bar">{{ usageText }}</div>

    <!-- 输入区 -->
    <div class="input-area">
      <div class="input-row">
        <textarea
          v-model="input"
          placeholder="问我关于你书签的任何问题…"
          rows="3"
          class="textarea"
          :disabled="isLoading"
          @keydown="onKeydown"
        />
        <button class="btn-send" :disabled="isLoading || !input.trim()" @click="send">发送</button>
      </div>
      <div v-if="errorMsg" class="error-bar">{{ errorMsg }}</div>
    </div>
  </div>
</template>

<style scoped>
.chat-root {
  font-family: ui-sans-serif, system-ui, sans-serif;
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
  background: var(--bg);
  color: var(--text);
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.topbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.logo {
  width: 28px;
  height: 28px;
  border-radius: 8px;
}
.title {
  font-weight: 700;
  font-size: 15px;
  color: var(--text);
}
.badge {
  font-size: 11px;
  color: var(--badge-text, #6b7280);
  background: var(--badge-bg, #f3f4f6);
  padding: 2px 7px;
  border-radius: 999px;
}
.btn-clear {
  padding: 5px 10px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
}
.btn-clear:hover {
  background: var(--bg-muted);
}
.chat-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.chat-list::-webkit-scrollbar { width: 4px; }
.chat-list::-webkit-scrollbar-thumb { background: var(--scrollbar, #d1d5db); border-radius: 4px; }
.welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding-top: 40px;
  max-width: 340px;
  margin: 0 auto;
}
.welcome-logo {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  margin-bottom: 12px;
}
.welcome-title {
  font-weight: 600;
  font-size: 16px;
  color: var(--text);
  margin-bottom: 6px;
}
.welcome-desc {
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.7;
}
.bubble-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.bubble-row-user { justify-content: flex-end; }
.bubble-row-ai  { justify-content: flex-start; }
.avatar-ai {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  flex-shrink: 0;
  object-fit: cover;
}
.avatar-user {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--user-avatar-bg, #e0e7ff);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  flex-shrink: 0;
}
.bubble {
  max-width: 80%;
  padding: 10px 14px;
  font-size: 13px;
  line-height: 1.65;
  word-break: break-word;
}
.bubble-user {
  border-radius: 16px 4px 16px 16px;
  background: var(--bubble-user-bg, #4f46e5);
  color: var(--bubble-user-text, #fff);
}
.bubble-ai {
  border-radius: 4px 16px 16px 16px;
  background: var(--bubble-ai-bg, #f3f4f6);
  color: var(--bubble-ai-text, #1f2937);
}
.loading-bubble {
  display: inline-flex;
  gap: 3px;
  align-items: center;
  color: var(--text-muted);
}
.dot {
  animation: dot 1.2s infinite;
}
@keyframes dot {
  0%, 80%, 100% { opacity: 0.2; }
  40% { opacity: 1; }
}
.usage-bar {
  padding: 4px 16px;
  font-size: 11px;
  color: var(--usage-text, #9ca3af);
  border-top: 1px solid var(--border-subtle, #f3f4f6);
  text-align: right;
  flex-shrink: 0;
}
.input-area {
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}
.input-row {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}
.textarea {
  flex: 1;
  padding: 9px 12px;
  border-radius: 12px;
  border: 1px solid var(--border-input, #d1d5db);
  font-size: 13px;
  line-height: 1.5;
  resize: none;
  outline: none;
  font-family: inherit;
  background: var(--bg-input);
  color: var(--text);
}
.textarea:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.25);
}
.btn-send {
  padding: 9px 16px;
  border-radius: 12px;
  border: none;
  background: #4f46e5;
  color: white;
  font-size: 13px;
  cursor: pointer;
  font-weight: 600;
  flex-shrink: 0;
  height: 42px;
  font-family: inherit;
}
.btn-send:hover:not(:disabled) { background: #4338ca; }
.btn-send:disabled { opacity: 0.5; cursor: not-allowed; }
.error-bar {
  margin-top: 6px;
  font-size: 12px;
  color: var(--error-color, #b91c1c);
}
</style>
