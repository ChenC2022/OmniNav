<script setup lang="ts">
import { ref, onMounted, inject, computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { onClickOutside } from '@vueuse/core'
import { useSettingsStore } from '@/stores/settings'
import { useBookmarksStore } from '@/stores/bookmarks'
import { useCategoriesStore } from '@/stores/categories'
import { usePinnedStore } from '@/stores/pinned'
import { buildSeedData } from '@/data/seed'
import type { Bookmark, Category } from '@/types'
import packageJson from '../../package.json'

const route = useRoute()
const settings = useSettingsStore()
const activeSection = computed(() => (route.hash || '#ai-chat').replace(/^#/, '') || 'ai-chat')
const appVersion = packageJson.version
const bookmarksStore = useBookmarksStore()
const categoriesStore = useCategoriesStore()
const pinnedStore = usePinnedStore()
const persistSettings = inject<() => Promise<void>>('persistSettings')
const saveBookmarks = inject<() => Promise<void>>('saveBookmarks')
const saveCategories = inject<() => Promise<void>>('saveCategories')
const savePinned = inject<() => Promise<void>>('savePinned')

const loadDemoLoading = ref(false)
const loadDemoDone = ref(false)
async function loadDemoData() {
  loadDemoLoading.value = true
  loadDemoDone.value = false
  try {
    const { categories: seedCats, bookmarks: seedBms } = buildSeedData()
    const baseOrder = categoriesStore.items.length
    seedCats.forEach((c, i) => categoriesStore.addCategory({ ...c, order: baseOrder + i }))
    seedBms.forEach((b) => bookmarksStore.addBookmark(b))
    await saveCategories?.()
    await saveBookmarks?.()
    loadDemoDone.value = true
    setTimeout(() => { loadDemoDone.value = false }, 3000)
  } catch (e) {
    importError.value = e instanceof Error ? e.message : '加载演示数据失败'
  } finally {
    loadDemoLoading.value = false
  }
}

const clearAllConfirm = ref(false)
const clearAllLoading = ref(false)
async function clearAllData() {
  clearAllLoading.value = true
  try {
    categoriesStore.setCategories([])
    bookmarksStore.setBookmarks([])
    pinnedStore.setIds([])
    await saveCategories?.()
    await saveBookmarks?.()
    await savePinned?.()
    clearAllConfirm.value = false
    // 刷新后 useDataSync 会重新拉取，并自动创建「未分类」
    window.location.reload()
  } catch (e) {
    importError.value = e instanceof Error ? e.message : '清空失败'
  } finally {
    clearAllLoading.value = false
  }
}

const aiBaseUrl = ref('')
const aiModel = ref('')
const aiApiKey = ref('')
const saving = ref(false)
const saved = ref(false)
const saveAiError = ref('')

const weatherMode = ref<'auto' | 'city'>('auto')
const weatherCityQuery = ref('')
const weatherCityResults = ref<Array<{ name: string; lat: number; lon: number; countryCode: string; admin1: string }>>([])
const weatherCityLoading = ref(false)
const weatherCityDropdown = ref(false)
const weatherSaving = ref(false)
const weatherSaved = ref(false)
let weatherGeocodeTimer: ReturnType<typeof setTimeout> | null = null
const weatherCityWrapRef = ref<HTMLElement | null>(null)
onClickOutside(weatherCityWrapRef, () => { weatherCityDropdown.value = false })

onMounted(() => {
  const ai = settings.data.ai
  if (ai) {
    aiBaseUrl.value = ai.baseUrl ?? ''
    aiModel.value = ai.model ?? ''
  }
  const w = settings.data.weather
  weatherMode.value = w?.mode === 'city' ? 'city' : 'auto'
  if (w?.mode === 'city' && w?.cityName) weatherCityQuery.value = w.cityName
})

const SAVE_TIMEOUT_MS = 15000

async function saveAi() {
  saving.value = true
  saved.value = false
  saveAiError.value = ''
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), SAVE_TIMEOUT_MS)
  try {
    const payload = {
      ...settings.data,
      ai: {
        ...settings.data?.ai,
        baseUrl: aiBaseUrl.value.trim() || undefined,
        model: aiModel.value.trim() || undefined,
        apiKey: aiApiKey.value.trim() || undefined,
      },
    }
    const res = await fetch('/api/data/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      const msg = (errBody as { error?: string })?.error || `保存失败 (${res.status})`
      throw new Error(msg)
    }
    settings.patchSettings({ ai: { baseUrl: aiBaseUrl.value.trim(), model: aiModel.value.trim() } })
    aiApiKey.value = ''
    saved.value = true
    setTimeout(() => { saved.value = false }, 2000)
  } catch (e) {
    saved.value = false
    if ((e as Error).name === 'AbortError') {
      saveAiError.value = '请求超时，请确认已启动 API 服务（如使用 npm run dev 需同时运行 npm run dev:api 或 npm run dev:all）'
    } else {
      saveAiError.value = (e as Error).message || '保存失败，请稍后重试'
    }
  } finally {
    clearTimeout(timeoutId)
    saving.value = false
  }
}

function onWeatherCitySearch() {
  if (weatherGeocodeTimer) clearTimeout(weatherGeocodeTimer)
  const q = weatherCityQuery.value.trim()
  if (q.length < 2) {
    weatherCityResults.value = []
    weatherCityDropdown.value = false
    return
  }
  weatherGeocodeTimer = setTimeout(async () => {
    weatherCityLoading.value = true
    weatherCityDropdown.value = true
    try {
      const res = await fetch(`/api/geocode?name=${encodeURIComponent(q)}`)
      const json = await res.json().catch(() => ({}))
      weatherCityResults.value = (json.results ?? []).slice(0, 8)
    } catch {
      weatherCityResults.value = []
    } finally {
      weatherCityLoading.value = false
    }
  }, 300)
}

function selectWeatherCity(item: { name: string; lat: number; lon: number; countryCode: string }) {
  weatherCityQuery.value = item.name
  weatherCityResults.value = []
  weatherCityDropdown.value = false
  saveWeatherCity(item)
}

async function saveWeatherCity(item: { name: string; lat: number; lon: number; countryCode: string }) {
  weatherSaving.value = true
  weatherSaved.value = false
  try {
    settings.patchSettings({
      weather: {
        mode: 'city',
        cityName: item.name,
        countryCode: item.countryCode,
        lat: item.lat,
        lon: item.lon,
      },
    })
    await persistSettings?.()
    weatherSaved.value = true
    setTimeout(() => { weatherSaved.value = false }, 2000)
  } finally {
    weatherSaving.value = false
  }
}

async function saveWeatherAuto() {
  weatherSaving.value = true
  weatherSaved.value = false
  try {
    settings.patchSettings({
      weather: { mode: 'auto', cityName: undefined, countryCode: undefined, lat: undefined, lon: undefined },
    })
    await persistSettings?.()
    weatherSaved.value = true
    setTimeout(() => { weatherSaved.value = false }, 2000)
  } finally {
    weatherSaving.value = false
  }
}

function exportData() {
  const data = {
    bookmarks: bookmarksStore.items,
    categories: categoriesStore.items,
    pinned: pinnedStore.ids,
    settings: settings.data,
    exportedAt: new Date().toISOString(),
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `omninav-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

const importFileInput = ref<HTMLInputElement | null>(null)
const importConfirm = ref(false)
const importError = ref('')
let importPending: {
  bookmarks: unknown[]
  categories: unknown[]
  pinned: string[]
  settings?: Record<string, unknown>
} | null = null

function triggerImport() {
  importError.value = ''
  importConfirm.value = false
  importPending = null
  importFileInput.value?.click()
}

function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const raw = reader.result as string
      const data = JSON.parse(raw) as {
        bookmarks?: unknown[]
        categories?: unknown[]
        pinned?: string[]
        settings?: Record<string, unknown>
      }
      if (!Array.isArray(data.bookmarks) || !Array.isArray(data.categories) || !Array.isArray(data.pinned)) {
        importError.value = 'JSON 格式无效，需包含 bookmarks、categories、pinned 数组'
        return
      }
      importPending = {
        bookmarks: data.bookmarks,
        categories: data.categories,
        pinned: data.pinned,
        settings: data.settings,
      }
      importConfirm.value = true
    } catch {
      importError.value = '无法解析 JSON'
    }
  }
  reader.readAsText(file)
}

async function confirmImport() {
  if (!importPending) return
  importError.value = ''
  try {
    bookmarksStore.setBookmarks(importPending.bookmarks as Bookmark[])
    categoriesStore.setCategories(importPending.categories as Category[])
    pinnedStore.setIds(importPending.pinned)
    await saveBookmarks?.()
    await saveCategories?.()
    await savePinned?.()
    if (importPending.settings && typeof importPending.settings === 'object') {
      settings.setSettings(importPending.settings)
      await persistSettings?.()
    }
    importConfirm.value = false
    importPending = null
  } catch (err) {
    importError.value = err instanceof Error ? err.message : '导入失败'
  }
}

function cancelImport() {
  importConfirm.value = false
  importPending = null
  importError.value = ''
}
</script>

<template>
  <div class="settings max-w-[1200px] mx-auto flex flex-col lg:flex-row gap-6 lg:gap-8 px-3 sm:px-4 md:px-6 py-6 sm:py-8">
    <aside class="w-64 flex-shrink-0 hidden lg:block lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto custom-scrollbar">
      <div class="flex flex-col gap-1">
        <div class="px-3 py-2 text-xs font-semibold text-slate-400 dark-text-94 uppercase tracking-wider mb-2">全局配置</div>
        <a href="#ai-chat" :class="activeSection === 'ai-chat' ? 'flex items-center gap-3 px-4 py-3 rounded-xl bg-primary text-white shadow-lg shadow-primary/20 font-medium text-sm' : 'flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 dark-text-94 hover:bg-slate-200/5 dark:hover:bg-white/5 transition-colors font-medium text-sm'"> <span class="material-symbols-outlined">chat_bubble</span> AI 对话 </a>
        <a href="#weather" :class="activeSection === 'weather' ? 'flex items-center gap-3 px-4 py-3 rounded-xl bg-primary text-white shadow-lg shadow-primary/20 font-medium text-sm' : 'flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 dark-text-94 hover:bg-slate-200/5 dark:hover:bg-white/5 transition-colors font-medium text-sm'"> <span class="material-symbols-outlined">cloud</span> 天气位置 </a>
        <a href="#data" :class="activeSection === 'data' ? 'flex items-center gap-3 px-4 py-3 rounded-xl bg-primary text-white shadow-lg shadow-primary/20 font-medium text-sm' : 'flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 dark-text-94 hover:bg-slate-200/5 dark:hover:bg-white/5 transition-colors font-medium text-sm'"> <span class="material-symbols-outlined">import_export</span> 导出 / 导入 </a>
        <div class="px-3 py-2 text-xs font-semibold text-slate-400 dark-text-94 uppercase tracking-wider mb-2 mt-4">应用</div>
        <a href="#about" :class="activeSection === 'about' ? 'flex items-center gap-3 px-4 py-3 rounded-xl bg-primary text-white shadow-lg shadow-primary/20 font-medium text-sm' : 'flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 dark-text-94 hover:bg-slate-200/5 dark:hover:bg-white/5 transition-colors font-medium text-sm'"> <span class="material-symbols-outlined">info</span> 关于 </a>
      </div>
    </aside>
    <div class="flex-1 max-w-3xl min-w-0">
      <div class="mb-8 sm:mb-10 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-3xl font-black text-slate-900 dark-text-94 mb-2">设置</h1>
          <p class="text-slate-500 dark-text-94">管理您的 OmniNav 偏好设置与外部连接。</p>
        </div>
        <RouterLink
          to="/"
          class="flex items-center gap-2 shrink-0 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark-text-94 hover:bg-slate-200/5 dark:hover:bg-white/5 transition-colors"
        >
          <span class="material-symbols-outlined text-lg">arrow_back</span>
          返回首页
        </RouterLink>
      </div>

      <section id="ai-chat" class="settings-section-card bg-white rounded-xl border border-slate-200 dark:border-white/20 p-4 sm:p-6 md:p-8 mb-6 sm:mb-8">
        <div class="flex items-center gap-3 mb-6">
          <div class="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <span class="material-symbols-outlined">chat_bubble</span>
          </div>
          <div>
            <h2 class="text-xl font-bold text-slate-900 dark-text-94">AI 对话配置</h2>
            <p class="text-sm text-slate-500 dark-text-94">配置您的 LLM 服务商信息。API Key 仅保存在云端。</p>
          </div>
        </div>
        <form class="grid grid-cols-1 md:grid-cols-2 gap-6" @submit.prevent="saveAi">
          <div class="md:col-span-2">
            <label class="block text-sm font-semibold mb-2 text-slate-700 dark-text-94">Base URL</label>
            <input v-model="aiBaseUrl" type="url" class="settings-input dark-text-94 w-full px-4 py-3 bg-slate-50 border border-slate-200 dark:border-white/20 rounded-xl focus:ring-primary focus:border-primary text-slate-900 dark:text-white" placeholder="https://xxx/v1" />
          </div>
          <div>
            <label class="block text-sm font-semibold mb-2 text-slate-700 dark-text-94">模型名称</label>
            <input v-model="aiModel" type="text" class="settings-input dark-text-94 w-full px-4 py-3 bg-slate-50 border border-slate-200 dark:border-white/20 rounded-xl focus:ring-primary focus:border-primary text-slate-900 dark:text-white" placeholder="gpt-4o" />
          </div>
          <div>
            <label class="block text-sm font-semibold mb-2 text-slate-700 dark-text-94">API Key</label>
            <input v-model="aiApiKey" type="password" autocomplete="off" class="settings-input dark-text-94 w-full px-4 py-3 bg-slate-50 border border-slate-200 dark:border-white/20 rounded-xl focus:ring-primary focus:border-primary text-slate-900 dark:text-white" placeholder="留空则保留已保存的密钥" />
          </div>
          <div class="md:col-span-2 flex justify-end mt-4">
            <button type="submit" class="bg-primary hover:bg-primary/90 text-white font-bold py-3 px-8 rounded-xl transition-all shadow-lg shadow-primary/25 disabled:opacity-50" :disabled="saving">
              {{ saving ? '保存中…' : '保存更改' }}
            </button>
            <span v-if="saved" class="ml-3 self-center text-sm text-green-600 dark:text-green-400">已保存</span>
            <p v-if="saveAiError" class="md:col-span-2 mt-2 text-sm text-red-600 dark:text-red-400">{{ saveAiError }}</p>
          </div>
        </form>
      </section>

      <section id="weather" class="settings-section-card bg-white rounded-xl border border-slate-200 dark:border-white/20 p-4 sm:p-6 md:p-8 mb-6 sm:mb-8">
        <div class="flex items-center gap-3 mb-6">
          <div class="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <span class="material-symbols-outlined">cloud</span>
          </div>
          <div>
            <h2 class="text-xl font-bold text-slate-900 dark-text-94">天气位置</h2>
            <p class="text-sm text-slate-500 dark-text-94">获取您所在地区的实时天气预报。</p>
          </div>
        </div>
        <div class="flex flex-col gap-6">
          <div class="flex gap-4">
            <button type="button" :class="weatherMode === 'auto' ? 'flex-1 py-3 px-4 border-2 border-primary bg-primary/5 text-primary rounded-xl font-bold text-sm' : 'flex-1 py-3 px-4 border-2 border-slate-200 dark:border-slate-800 text-slate-600 dark-text-94 rounded-xl font-bold text-sm'" @click="weatherMode = 'auto'; saveWeatherAuto()"> 自动检测 </button>
            <button type="button" :class="weatherMode === 'city' ? 'flex-1 py-3 px-4 border-2 border-primary bg-primary/5 text-primary rounded-xl font-bold text-sm' : 'flex-1 py-3 px-4 border-2 border-slate-200 dark:border-slate-800 text-slate-600 dark-text-94 rounded-xl font-bold text-sm'" @click="weatherMode = 'city'"> 手动设置 </button>
          </div>
          <div v-if="weatherMode === 'city'" ref="weatherCityWrapRef" class="relative">
            <label class="block text-sm font-semibold mb-2 text-slate-700 dark-text-94">搜索城市</label>
            <input v-model="weatherCityQuery" type="text" class="settings-input dark-text-94 w-full px-4 py-3 bg-slate-50 border border-slate-200 dark:border-white/20 rounded-xl focus:ring-primary focus:border-primary text-slate-900 dark:text-white" placeholder="输入城市名称..." @input="onWeatherCitySearch" @focus="weatherCityQuery.trim().length >= 2 && (weatherCityDropdown = true)" />
            <div v-if="weatherCityDropdown && (weatherCityResults.length > 0 || weatherCityLoading)" class="settings-dropdown absolute top-full left-0 right-0 mt-1 rounded-xl border border-slate-200 dark:border-white/20 bg-white shadow-lg z-10 max-h-56 overflow-auto">
              <p v-if="weatherCityLoading" class="px-3 py-2 text-sm text-slate-500 dark-text-94">搜索中…</p>
              <button v-for="item in weatherCityResults" :key="`${item.name}-${item.lat}-${item.lon}`" type="button" class="w-full text-left px-3 py-2 text-sm hover:bg-slate-200/5 dark:hover:bg-white/5 flex justify-between rounded-lg" @click="selectWeatherCity(item)">
                <span class="text-slate-800 dark-text-94">{{ item.name }}</span>
                <span class="text-slate-500 dark-text-94">{{ item.countryCode }} {{ item.admin1 ? `· ${item.admin1}` : '' }}</span>
              </button>
            </div>
          </div>
          <div v-if="settings.data.weather?.cityName" class="settings-card-inner p-4 bg-slate-50 rounded-xl flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="material-symbols-outlined text-slate-400">location_on</span>
              <span class="font-medium text-slate-900 dark-text-94">当前城市: <span class="text-primary font-bold">{{ settings.data.weather.cityName }}{{ settings.data.weather.countryCode ? ` (${settings.data.weather.countryCode})` : '' }}</span></span>
            </div>
          </div>
        </div>
        <p v-if="weatherSaved" class="mt-2 text-sm text-green-600 dark:text-green-400">已保存</p>
      </section>

      <section id="data" class="settings-section-card bg-white rounded-xl border border-slate-200 dark:border-white/20 p-4 sm:p-6 md:p-8 mb-12 sm:mb-20">
        <div class="flex items-center gap-3 mb-6">
          <div class="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <span class="material-symbols-outlined">import_export</span>
          </div>
          <div>
            <h2 class="text-xl font-bold text-slate-900 dark-text-94">导出 / 导入</h2>
            <p class="text-sm text-slate-500 dark-text-94">备份或迁移您的 OmniNav 配置。</p>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="p-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-center">
            <span class="material-symbols-outlined text-4xl text-slate-300 dark:text-slate-600 mb-3 block">download_for_offline</span>
            <p class="text-sm text-slate-600 dark-text-94 mb-4 font-medium">将所有设置下载为 JSON 文件。</p>
            <button type="button" class="w-full py-3 bg-slate-900 dark:bg-white dark-text-94 text-white font-bold rounded-xl hover:opacity-90 transition-opacity" @click="exportData">导出 JSON</button>
          </div>
          <div class="p-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-center">
            <span class="material-symbols-outlined text-4xl text-slate-300 dark:text-slate-600 mb-3 block">upload_file</span>
            <p class="text-sm text-slate-600 dark-text-94 mb-4 font-medium">从本地 JSON 文件恢复设置。</p>
            <button type="button" class="w-full py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20" @click="triggerImport">从 JSON 导入</button>
          </div>
        </div>
        <input ref="importFileInput" type="file" accept=".json,application/json" class="hidden" @change="onImportFile" />
        <p v-if="importError" class="mt-4 text-sm text-red-500 dark:text-red-400">{{ importError }}</p>
        <div class="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
          <p class="text-sm text-slate-600 dark-text-94 mb-3">追加演示用分类与书签（开发、设计、文档、云运维、学习、娱乐、未分类等），方便查看首页展示效果。</p>
          <button
            type="button"
            class="px-4 py-2 rounded-xl border-2 border-dashed border-primary text-primary font-medium hover:bg-primary/5 disabled:opacity-50 transition-colors"
            :disabled="loadDemoLoading"
            @click="loadDemoData"
          >
            {{ loadDemoLoading ? '加载中…' : '加载演示数据' }}
          </button>
          <span v-if="loadDemoDone" class="ml-3 text-sm text-green-600 dark:text-green-400">已加载演示数据，请回首页查看</span>
        </div>
        <div class="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
          <p class="text-sm text-slate-600 dark:text-94 mb-3">清空所有书签、分类与置顶，并同步到云端。清空后刷新页面将只保留一个「未分类」区域。</p>
          <button
            type="button"
            class="px-4 py-2 rounded-xl border-2 border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 font-medium hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 transition-colors"
            :disabled="clearAllLoading"
            @click="clearAllConfirm = true"
          >
            {{ clearAllLoading ? '清空中…' : '清空所有数据' }}
          </button>
        </div>
      </section>

      <section id="about" class="settings-section-card bg-white rounded-xl border border-slate-200 dark:border-white/20 p-4 sm:p-6 md:p-8 mb-12 sm:mb-20">
        <div class="flex items-center gap-3 mb-6">
          <div class="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <span class="material-symbols-outlined">info</span>
          </div>
          <div>
            <h2 class="text-xl font-bold text-slate-900 dark-text-94">关于</h2>
            <p class="text-sm text-slate-500 dark-text-94">OmniNav 功能说明与当前版本。</p>
          </div>
        </div>
        <div class="space-y-4 text-sm text-slate-700 dark-text-94">
          <p class="font-semibold text-base">OmniNav · 个人 AI 智能驾驶舱</p>
          <p>书签管理与 AI 助手一体的极简个人工作台，数据同步至 Cloudflare KV，支持自部署。</p>
          <p class="pt-2 font-semibold">当前版本</p>
          <p class="font-mono text-primary">{{ appVersion }}</p>
          <p class="pt-2 font-semibold">主要功能</p>
          <ul class="list-disc list-inside space-y-1.5 pl-1 opacity-90">
            <li><strong>首页</strong>：常用（置顶书签）、分类卡片（私密分类、宽屏多列/瀑布流）、未分类（添加 / 导入 / 清理失效 / AI 自动归类）、检查链接</li>
            <li><strong>搜索</strong>：顶部聚合搜索，模式标签（网页/书签）可点击或按 Tab 切换；网页模式可切换搜索引擎，书签模式搜本地；⌘K 聚焦并进入书签模式</li>
            <li><strong>AI 对话</strong>：右侧抽屉，可配置 Base URL / 模型 / API Key</li>
            <li><strong>设置</strong>：AI 配置、天气位置、背景（Bing 每日一图）、导出/导入 JSON</li>
          </ul>
          <p class="pt-2 text-slate-500 dark:text-slate-400 text-xs">技术栈：Vue 3 + Vite + Tailwind CSS v4 + Pinia；Hono on Cloudflare Pages；存储 KV。</p>
        </div>
      </section>
    </div>

    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="importConfirm"
          class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          @click.self="cancelImport"
        >
          <div
            class="settings-modal-card w-full max-w-sm rounded-xl bg-white shadow-xl p-5 border border-slate-200 dark:border-white/20"
            @click.stop
          >
            <h3 class="text-lg font-medium text-slate-800 dark-text-94 mb-2">确认导入</h3>
            <p class="text-sm text-slate-600 dark-text-94 mb-4">
              将用导入的数据覆盖当前书签、分类、置顶与配置（若包含），并同步到云端。是否继续？
            </p>
            <div class="flex justify-end gap-2">
              <button type="button" class="px-3 py-1.5 rounded-xl text-slate-600 dark-text-94 hover:bg-slate-200/5 dark:hover:bg-white/5" @click="cancelImport">取消</button>
              <button type="button" class="px-3 py-1.5 rounded-xl bg-primary text-white font-medium hover:bg-primary/90" @click="confirmImport">确认导入</button>
            </div>
          </div>
        </div>
      </Transition>
      <Transition name="modal">
        <div
          v-if="clearAllConfirm"
          class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          @click.self="clearAllConfirm = false"
        >
          <div
            class="settings-modal-card w-full max-w-sm rounded-xl bg-white dark:bg-slate-900 shadow-xl p-5 border border-slate-200 dark:border-white/20"
            @click.stop
          >
            <h3 class="text-lg font-medium text-slate-800 dark:text-94 mb-2">确认清空</h3>
            <p class="text-sm text-slate-600 dark:text-94 mb-4">
              将清空所有书签、分类与置顶，并同步到云端。清空后页面会刷新，仅保留「未分类」区域。此操作不可撤销，是否继续？
            </p>
            <div class="flex justify-end gap-2">
              <button type="button" class="px-3 py-1.5 rounded-xl text-slate-600 dark:text-94 hover:bg-slate-200/5 dark:hover:bg-white/5" @click="clearAllConfirm = false">取消</button>
              <button type="button" class="px-3 py-1.5 rounded-xl bg-red-600 text-white font-medium hover:bg-red-500" :disabled="clearAllLoading" @click="clearAllData">清空</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
