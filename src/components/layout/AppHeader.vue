<script setup lang="ts">
import { ref, computed, provide, inject, onMounted, onUnmounted } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import ClockWidget from './ClockWidget.vue'
import WeatherWidget from './WeatherWidget.vue'
import { useUiStore } from '@/stores/ui'
import { get12StaticQuotes, getRandomQuote } from '@/data/quotes'
import { apiFetch } from '@/utils/api'

const router = useRouter()
const ui = useUiStore()
const { theme } = storeToRefs(ui)
const persistTheme = inject<() => Promise<void>>('persistTheme')

function cycleThemeAndPersist() {
  ui.cycleTheme()
  persistTheme?.()
}

const themeIcon = computed(() => {
  if (theme.value === 'system') return 'brightness_auto'
  if (theme.value === 'light') return 'light_mode'
  return 'dark_mode'
})

const themeTitle = computed(() => {
  if (theme.value === 'system') return '主题：跟随系统（点击切换）'
  if (theme.value === 'light') return '主题：浅色（点击切换）'
  return '主题：深色（点击切换）'
})

const QUOTE_COUNT = 12
const ROTATE_INTERVAL_MS = 5 * 60 * 1000 // 5 分钟

const headerCityName = ref('')
const quoteList = ref<string[]>([])
const quoteIndex = ref(0)
const quoteTimerId = ref<ReturnType<typeof setInterval> | null>(null)

const displayQuote = computed(() => quoteList.value[quoteIndex.value] ?? '')

provide('setHeaderCityName', (name: string) => {
  headerCityName.value = name
})

const QUOTE_PROMPT = `请随机生成 12 句简短的中文励志语或格言，用于个人首页轮播展示。每句单独一行，共 12 行；不要编号、不要引号、不要多余解释。`

function parseQuotesFromResponse(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((s) => s.replace(/^[\d、\.\s]+/, '').trim())
    .filter(Boolean)
  return lines.slice(0, QUOTE_COUNT)
}

function ensure12Quotes(list: string[]): string[] {
  if (list.length >= QUOTE_COUNT) return list.slice(0, QUOTE_COUNT)
  const result = [...list]
  while (result.length < QUOTE_COUNT) result.push(getRandomQuote())
  return result
}

async function fetchQuotesFromAI() {
  try {
    const res = await apiFetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: QUOTE_PROMPT }],
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((data as { error?: string })?.error ?? '请求失败')
    const text = ((data as { message?: string })?.message ?? '').trim()
    const parsed = parseQuotesFromResponse(text)
    if (parsed.length > 0) quoteList.value = ensure12Quotes(parsed)
  } catch {
    quoteList.value = get12StaticQuotes()
  }
}

async function logout() {
  await apiFetch('/api/auth/logout', { method: 'POST' })
  router.push('/login')
}

function nextQuote() {
  const len = Math.max(1, quoteList.value.length)
  quoteIndex.value = (quoteIndex.value + 1) % len
}

function startQuoteTimer() {
  quoteTimerId.value = setInterval(nextQuote, ROTATE_INTERVAL_MS)
}

onMounted(() => {
  quoteList.value = get12StaticQuotes()
  fetchQuotesFromAI()
  startQuoteTimer()
})

onUnmounted(() => {
  if (quoteTimerId.value) clearInterval(quoteTimerId.value)
})
</script>

<template>
  <header class="header shrink-0 sticky z-50 mx-2 sm:mx-4 md:mx-6 mt-2 sm:mt-4" style="top: max(0.5rem, env(safe-area-inset-top));">
    <div class="h-12 sm:h-14 md:h-16 px-3 sm:px-4 md:px-5 flex items-center justify-between gap-2 rounded-2xl glass-translucent shadow-lg min-w-0">
      <div class="header-left flex items-center gap-3 md:gap-4 min-w-0">
        <RouterLink
          to="/"
          class="flex items-center gap-2.5 shrink-0 rounded-xl py-1.5 -ml-1 transition-opacity hover:opacity-90 text-indigo-600 dark:text-indigo-300"
          aria-label="OmniNav 首页"
        >
          <span class="size-9 bg-indigo-500 dark:bg-indigo-400 rounded-xl flex items-center justify-center text-white shadow-lg">
            <span class="material-symbols-outlined text-xl">rocket_launch</span>
          </span>
          <span class="text-slate-800 dark-text-94 text-lg font-bold leading-tight tracking-tight hidden sm:inline">OmniNav</span>
        </RouterLink>
        <span v-if="headerCityName" class="text-sm font-medium text-slate-500 dark-text-94 shrink-0 truncate hidden md:inline">{{ headerCityName }}</span>
        <ClockWidget />
        <WeatherWidget />
      </div>
      <div v-if="displayQuote" class="header-center flex-1 min-w-0 flex items-center justify-center max-w-xl min-w-0 px-2">
        <button
          type="button"
          class="rounded-xl glass-translucent px-3 py-2 flex items-center gap-2 border border-slate-200/50 dark:border-white/10 w-full max-w-md text-left hover:border-indigo-400/40 dark:hover:border-indigo-400/40 transition-colors cursor-pointer min-w-0"
          title="点击切换下一条"
          @click="nextQuote"
        >
          <span class="material-symbols-outlined text-indigo-500 dark:text-indigo-400 text-lg shrink-0">format_quote</span>
          <p class="text-sm text-slate-600 dark:text-slate-300 italic flex-1 min-w-0 truncate">{{ displayQuote }}</p>
        </button>
      </div>
      <div class="header-right flex items-center gap-2 shrink-0">
        <button
          type="button"
          class="h-9 w-9 md:h-10 md:w-10 rounded-xl flex items-center justify-center transition-colors cursor-pointer glass-translucent border border-slate-200/60 dark:border-white/20 text-slate-600 dark:text-white/80 hover:bg-slate-200/50 dark:hover:bg-white/10 shrink-0"
          :title="themeTitle"
          :aria-label="themeTitle"
          @click="cycleThemeAndPersist"
        >
          <span class="material-symbols-outlined text-[22px]">{{ themeIcon }}</span>
        </button>
        <button
          type="button"
          class="h-9 w-9 md:h-10 md:w-10 rounded-xl flex items-center justify-center transition-colors cursor-pointer shrink-0 bg-indigo-500 dark:bg-indigo-400 text-white hover:bg-indigo-600 dark:hover:bg-indigo-300 active:scale-[0.98]"
          title="AI 对话"
          aria-label="AI 对话"
          @click="ui.toggleDrawer()"
        >
          <span class="material-symbols-outlined text-[22px]">auto_awesome</span>
        </button>
        <RouterLink
          to="/settings"
          class="h-9 w-9 md:h-10 md:w-10 rounded-xl flex items-center justify-center glass-translucent border border-slate-200/60 dark:border-white/20 text-slate-600 dark:text-white/80 hover:bg-slate-200/50 dark:hover:bg-white/10 transition-colors cursor-pointer shrink-0"
          aria-label="设置"
        >
          <span class="material-symbols-outlined text-[22px]">settings</span>
        </RouterLink>
        <button
          type="button"
          class="h-9 w-9 md:h-10 md:w-10 rounded-xl flex items-center justify-center glass-translucent border border-slate-200/60 dark:border-white/20 text-slate-600 dark:text-white/80 hover:bg-slate-200/50 dark:hover:bg-white/10 transition-colors cursor-pointer shrink-0"
          title="退出登录"
          aria-label="退出登录"
          @click="logout"
        >
          <span class="material-symbols-outlined text-[22px]">logout</span>
        </button>
      </div>
    </div>
  </header>
</template>
