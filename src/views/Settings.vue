<script setup lang="ts">
import { ref, onMounted, inject, computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { onClickOutside } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { useSettingsStore } from '@/stores/settings'
import { useBookmarksStore } from '@/stores/bookmarks'
import { useCategoriesStore } from '@/stores/categories'
import { usePinnedStore } from '@/stores/pinned'
import { useUiStore } from '@/stores/ui'
import { SEARCH_ENGINES } from '@/constants/searchEngines'
import { PROMPT_TEST_CONNECTION } from '@/constants/prompts'
import { parseBookmarkHtmlWithFolders, buildBookmarkHtml } from '@/utils/parseBookmarkHtml'
import { parseSunPanelJson } from '@/utils/parseSunPanel'
import { nanoid } from '@/utils/id'
import type { Bookmark, Category } from '@/types'
import packageJson from '../../package.json'
import { apiFetch } from '@/utils/api'

const route = useRoute()
const settings = useSettingsStore()
const ui = useUiStore()
const { theme } = storeToRefs(ui)
const activeSection = computed(() => (route.hash || '#general').replace(/^#/, '') || 'general')
const appVersion = packageJson.version
const bookmarksStore = useBookmarksStore()
const categoriesStore = useCategoriesStore()
const pinnedStore = usePinnedStore()
const persistSettings = inject<() => Promise<void>>('persistSettings')
const persistTheme = inject<() => Promise<void>>('persistTheme')
const saveBookmarks = inject<() => Promise<void>>('saveBookmarks')
const saveCategories = inject<() => Promise<void>>('saveCategories')
const savePinned = inject<() => Promise<void>>('savePinned')

// ─── 通用设置 ───
function setThemeAndPersist(mode: 'system' | 'light' | 'dark') {
  ui.setTheme(mode)
  persistTheme?.()
}

const currentEngineId = computed(() => settings.data.defaultSearchEngine ?? 'google')
async function setDefaultEngine(id: string) {
  settings.patchSettings({ defaultSearchEngine: id })
  await persistSettings?.()
}

const linkOpenMode = computed(() => settings.data.linkOpenMode ?? 'newTab')
async function setLinkOpenMode(mode: 'newTab' | 'currentTab') {
  settings.patchSettings({ linkOpenMode: mode })
  await persistSettings?.()
}

// ─── AI 配置 ───
const aiBaseUrl = ref('')
const aiModel = ref('')
const aiApiKey = ref('')
const saving = ref(false)
const saved = ref(false)
const saveAiError = ref('')

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

// ─── AI 连接测试 ───
const testingAi = ref(false)
const testAiResult = ref<'success' | 'error' | ''>('')
const testAiMessage = ref('')
const testAiResponseTime = ref(0)

async function testAiConnection() {
  testingAi.value = true
  testAiResult.value = ''
  testAiMessage.value = ''
  testAiResponseTime.value = 0
  const start = Date.now()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), SAVE_TIMEOUT_MS)
  try {
    const res = await apiFetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: PROMPT_TEST_CONNECTION }],
      }),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    testAiResponseTime.value = Date.now() - start
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const code = (data as { code?: string })?.code
      if (code === 'AI_NOT_CONFIGURED') {
        testAiResult.value = 'error'
        testAiMessage.value = 'AI 未配置，请先填写 Base URL、Model 与 API Key 并保存'
      } else {
        testAiResult.value = 'error'
        testAiMessage.value = (data as { error?: string })?.error ?? `请求失败 (${res.status})`
      }
      return
    }
    const text = ((data as { message?: string })?.message ?? '').trim()
    testAiResult.value = 'success'
    testAiMessage.value = text || '（空回复）'
  } catch (e) {
    clearTimeout(timeoutId)
    testAiResponseTime.value = Date.now() - start
    testAiResult.value = 'error'
    if ((e as Error).name === 'AbortError') {
      testAiMessage.value = '请求超时，请检查 Base URL 是否正确以及网络连接'
    } else {
      testAiMessage.value = (e as Error).message || '连接失败'
    }
  } finally {
    testingAi.value = false
  }
}

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
    const res = await apiFetch('/api/data/settings', {
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

// ─── 天气 ───
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

// ─── 导出 / 导入 ───
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

// ─── 清空数据 ───
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
    window.location.reload()
  } catch (e) {
    importError.value = e instanceof Error ? e.message : '清空失败'
  } finally {
    clearAllLoading.value = false
  }
}

// ─── 浏览器书签导入 ───
const browserImportFileInput = ref<HTMLInputElement | null>(null)
const browserImportLoading = ref(false)
const browserImportResult = ref('')
const browserImportConfirm = ref(false)
const UNCATEGORIZED_NAMES = ['未分类', '未分类链接', '快捷链接']

let browserImportPending: { folders: Array<{ name: string; bookmarks: Array<{ title: string; url: string }> }> } | null = null

function triggerBrowserImport() {
  browserImportResult.value = ''
  browserImportConfirm.value = false
  browserImportPending = null
  browserImportFileInput.value?.click()
}

function onBrowserImportFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const html = reader.result as string
      const folders = parseBookmarkHtmlWithFolders(html)
      const totalLinks = folders.reduce((sum, f) => sum + f.bookmarks.length, 0)
      if (totalLinks === 0) {
        browserImportResult.value = '未解析到有效链接，请确认为浏览器导出的书签 HTML 文件'
        return
      }
      browserImportPending = { folders }
      browserImportConfirm.value = true
    } catch {
      browserImportResult.value = '无法解析文件'
    }
  }
  reader.readAsText(file)
}

function cancelBrowserImport() {
  browserImportConfirm.value = false
  browserImportPending = null
}

const browserImportSummary = computed(() => {
  if (!browserImportPending) return { folders: 0, links: 0 }
  const f = browserImportPending.folders.filter((x) => x.name).length
  const l = browserImportPending.folders.reduce((s, x) => s + x.bookmarks.length, 0)
  return { folders: f, links: l }
})

async function confirmBrowserImport() {
  if (!browserImportPending) return
  browserImportLoading.value = true
  browserImportResult.value = ''
  try {
    const folders = browserImportPending.folders
    const existingUrls = new Set(bookmarksStore.items.map((b) => b.url))
    const categoryNameToId = new Map<string, string>()
    for (const c of categoriesStore.items) categoryNameToId.set(c.name, c.id)

    let uncatId = ''
    for (const n of UNCATEGORIZED_NAMES) {
      if (categoryNameToId.has(n)) { uncatId = categoryNameToId.get(n)!; break }
    }
    if (!uncatId) {
      uncatId = nanoid()
      categoriesStore.addCategory({ id: uncatId, name: '未分类', order: categoriesStore.items.length })
      categoryNameToId.set('未分类', uncatId)
    }

    let addedCategories = 0
    let addedBookmarks = 0
    let skipped = 0
    let maxOrder = categoriesStore.items.length

    for (const folder of folders) {
      let catId: string
      if (!folder.name) {
        catId = uncatId
      } else {
        const existing = categoryNameToId.get(folder.name)
        if (existing) {
          catId = existing
        } else {
          catId = nanoid()
          categoriesStore.addCategory({ id: catId, name: folder.name, order: maxOrder++ })
          categoryNameToId.set(folder.name, catId)
          addedCategories++
        }
      }

      let bmOrder = bookmarksStore.items.filter((b) => b.categoryId === catId).length
      for (const bm of folder.bookmarks) {
        if (existingUrls.has(bm.url)) {
          skipped++
          continue
        }
        existingUrls.add(bm.url)
        bookmarksStore.addBookmark({
          id: nanoid(),
          title: bm.title,
          url: bm.url,
          categoryId: catId,
          order: bmOrder++,
        })
        addedBookmarks++
      }
    }

    await saveCategories?.()
    await saveBookmarks?.()

    const parts: string[] = []
    if (addedCategories > 0) parts.push(`新建 ${addedCategories} 个分类`)
    parts.push(`导入 ${addedBookmarks} 个书签`)
    if (skipped > 0) parts.push(`跳过 ${skipped} 个重复`)
    browserImportResult.value = parts.join('，')
    browserImportConfirm.value = false
    browserImportPending = null
  } catch (err) {
    browserImportResult.value = err instanceof Error ? err.message : '导入失败'
  } finally {
    browserImportLoading.value = false
  }
}

// ─── 浏览器书签导出 ───
function exportBrowserBookmarks() {
  const categoryIdToName = new Map<string, string>()
  for (const c of categoriesStore.items) categoryIdToName.set(c.id, c.name)

  const html = buildBookmarkHtml(
    categoriesStore.items.map((c) => ({ name: c.name })),
    bookmarksStore.items.map((b) => ({ title: b.title, url: b.url, categoryId: b.categoryId })),
    categoryIdToName,
  )
  const blob = new Blob([html], { type: 'text/html' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `omninav-bookmarks-${new Date().toISOString().slice(0, 10)}.html`
  a.click()
  URL.revokeObjectURL(a.href)
}

// ─── Sun-Panel 导入 ───
const sunPanelImportFileInput = ref<HTMLInputElement | null>(null)
const sunPanelImportLoading = ref(false)
const sunPanelImportResult = ref('')
const sunPanelImportConfirm = ref(false)

import type { SunPanelParseResult } from '@/utils/parseSunPanel'
let sunPanelImportPending: SunPanelParseResult | null = null

function triggerSunPanelImport() {
  sunPanelImportResult.value = ''
  sunPanelImportConfirm.value = false
  sunPanelImportPending = null
  sunPanelImportFileInput.value?.click()
}

function onSunPanelImportFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const raw = reader.result as string
      const json = JSON.parse(raw)
      const parsed = parseSunPanelJson(json)
      if (!parsed) {
        sunPanelImportResult.value = '无法识别 Sun-Panel 格式，请确认为 Sun-Panel 导出的 JSON 文件'
        return
      }
      sunPanelImportPending = parsed
      sunPanelImportConfirm.value = true
    } catch {
      sunPanelImportResult.value = '无法解析 JSON 文件'
    }
  }
  reader.readAsText(file)
}

function cancelSunPanelImport() {
  sunPanelImportConfirm.value = false
  sunPanelImportPending = null
}

const sunPanelImportSummary = computed(() => {
  if (!sunPanelImportPending) return { groups: 0, items: 0 }
  return { groups: sunPanelImportPending.groups.length, items: sunPanelImportPending.items.length }
})

async function confirmSunPanelImport() {
  if (!sunPanelImportPending) return
  sunPanelImportLoading.value = true
  sunPanelImportResult.value = ''
  try {
    const { groups, items } = sunPanelImportPending
    const existingUrls = new Set(bookmarksStore.items.map((b) => b.url))
    const categoryNameToId = new Map<string, string>()
    for (const c of categoriesStore.items) categoryNameToId.set(c.name, c.id)

    let uncatId = ''
    for (const n of UNCATEGORIZED_NAMES) {
      if (categoryNameToId.has(n)) { uncatId = categoryNameToId.get(n)!; break }
    }
    if (!uncatId) {
      uncatId = nanoid()
      categoriesStore.addCategory({ id: uncatId, name: '未分类', order: categoriesStore.items.length })
      categoryNameToId.set('未分类', uncatId)
    }

    let addedCategories = 0
    let addedBookmarks = 0
    let skipped = 0
    let maxOrder = categoriesStore.items.length

    for (const item of items) {
      const catName = item.groupName || ''

      let catId: string
      if (!catName) {
        catId = uncatId
      } else {
        const existing = categoryNameToId.get(catName)
        if (existing) {
          catId = existing
        } else {
          catId = nanoid()
          categoriesStore.addCategory({ id: catId, name: catName, order: maxOrder++ })
          categoryNameToId.set(catName, catId)
          addedCategories++
        }
      }

      if (existingUrls.has(item.url)) {
        skipped++
        continue
      }
      existingUrls.add(item.url)

      const bmOrder = bookmarksStore.items.filter((b) => b.categoryId === catId).length
      bookmarksStore.addBookmark({
        id: nanoid(),
        title: item.title,
        url: item.url,
        description: item.description || undefined,
        categoryId: catId,
        order: bmOrder,
      })
      addedBookmarks++
    }

    await saveCategories?.()
    await saveBookmarks?.()

    const parts: string[] = []
    if (addedCategories > 0) parts.push(`新建 ${addedCategories} 个分类`)
    parts.push(`导入 ${addedBookmarks} 个书签`)
    if (skipped > 0) parts.push(`跳过 ${skipped} 个重复`)
    sunPanelImportResult.value = parts.join('，')
    sunPanelImportConfirm.value = false
    sunPanelImportPending = null
  } catch (err) {
    sunPanelImportResult.value = err instanceof Error ? err.message : '导入失败'
  } finally {
    sunPanelImportLoading.value = false
  }
}

// ─── 修改密码 ───
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const passwordError = ref('')
const passwordSuccess = ref('')
const passwordLoading = ref(false)

async function submitChangePassword() {
  passwordError.value = ''
  passwordSuccess.value = ''
  const cur = currentPassword.value.trim()
  const newPwd = newPassword.value.trim()
  const confirm = confirmPassword.value.trim()
  if (!cur) {
    passwordError.value = '请输入当前密码'
    return
  }
  if (!newPwd || newPwd.length < 4) {
    passwordError.value = '新密码至少 4 位'
    return
  }
  if (newPwd !== confirm) {
    passwordError.value = '两次输入的新密码不一致'
    return
  }
  passwordLoading.value = true
  try {
    const res = await apiFetch('/api/auth/set-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: cur, newPassword: newPwd }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.ok) {
      passwordSuccess.value = '密码已修改，下次登录请使用新密码。'
      currentPassword.value = ''
      newPassword.value = ''
      confirmPassword.value = ''
    } else {
      passwordError.value = (data?.error as string) || '修改失败'
    }
  } finally {
    passwordLoading.value = false
  }
}

// ─── 侧边栏导航项 ───
const navItems = [
  { id: 'general', icon: 'tune', label: '通用设置' },
  { id: 'password', icon: 'lock', label: '修改密码' },
  { id: 'ai-chat', icon: 'auto_awesome', label: 'AI 助手' },
  { id: 'weather', icon: 'cloud', label: '天气位置' },
  { id: 'data', icon: 'import_export', label: '数据管理' },
  { id: 'about', icon: 'info', label: '关于' },
]
</script>

<template>
  <div class="settings max-w-[1200px] mx-auto flex flex-col lg:flex-row gap-6 lg:gap-8 px-3 sm:px-4 md:px-6 py-6 sm:py-8">
    <!-- 侧边栏导航 -->
    <aside class="w-64 flex-shrink-0 hidden lg:block lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto custom-scrollbar">
      <div class="flex flex-col gap-1">
        <a
          v-for="item in navItems"
          :key="item.id"
          :href="`#${item.id}`"
          :class="activeSection === item.id
            ? 'flex items-center gap-3 px-4 py-3 rounded-xl bg-primary text-white shadow-lg shadow-primary/20 font-medium text-sm'
            : 'flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 dark-text-94 hover:bg-slate-200/50 dark:hover:bg-white/10 transition-colors font-medium text-sm'"
        >
          <span class="material-symbols-outlined">{{ item.icon }}</span>
          {{ item.label }}
        </a>
      </div>
    </aside>

    <!-- 主内容区 -->
    <div class="flex-1 max-w-3xl min-w-0">
      <!-- 页面标题 -->
      <div class="mb-8 sm:mb-10 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-3xl font-black text-slate-900 dark-text-94 mb-2">设置</h1>
          <p class="text-slate-500 dark-text-94">管理您的 OmniNav 偏好设置与外部连接。</p>
        </div>
        <RouterLink
          to="/"
          class="flex items-center gap-2 shrink-0 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark-text-94 hover:bg-slate-200/50 dark:hover:bg-white/10 transition-colors"
        >
          <span class="material-symbols-outlined text-lg">arrow_back</span>
          返回首页
        </RouterLink>
      </div>

      <!-- ═══════ 通用设置 ═══════ -->
      <section id="general" class="settings-section-card bg-white rounded-xl border border-slate-200 dark:border-white/20 p-4 sm:p-6 md:p-8 mb-6 sm:mb-8">
        <div class="flex items-center gap-3 mb-6">
          <div class="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <span class="material-symbols-outlined">tune</span>
          </div>
          <div>
            <h2 class="text-xl font-bold text-slate-900 dark-text-94">通用设置</h2>
            <p class="text-sm text-slate-500 dark-text-94">主题、搜索引擎与浏览偏好。</p>
          </div>
        </div>

        <!-- 主题模式 -->
        <div class="mb-8">
          <label class="block text-sm font-semibold mb-3 text-slate-700 dark-text-94">主题模式</label>
          <div class="grid grid-cols-3 gap-3">
            <button
              type="button"
              :class="theme === 'system'
                ? 'flex flex-col items-center gap-2 py-4 px-3 border-2 border-primary bg-primary/5 rounded-xl font-bold text-sm text-primary'
                : 'flex flex-col items-center gap-2 py-4 px-3 border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark-text-94 rounded-xl font-bold text-sm hover:border-slate-300 dark:hover:border-slate-600 transition-colors'"
              @click="setThemeAndPersist('system')"
            >
              <span class="material-symbols-outlined text-2xl">brightness_auto</span>
              <span>跟随系统</span>
            </button>
            <button
              type="button"
              :class="theme === 'light'
                ? 'flex flex-col items-center gap-2 py-4 px-3 border-2 border-primary bg-primary/5 rounded-xl font-bold text-sm text-primary'
                : 'flex flex-col items-center gap-2 py-4 px-3 border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark-text-94 rounded-xl font-bold text-sm hover:border-slate-300 dark:hover:border-slate-600 transition-colors'"
              @click="setThemeAndPersist('light')"
            >
              <span class="material-symbols-outlined text-2xl">light_mode</span>
              <span>浅色模式</span>
            </button>
            <button
              type="button"
              :class="theme === 'dark'
                ? 'flex flex-col items-center gap-2 py-4 px-3 border-2 border-primary bg-primary/5 rounded-xl font-bold text-sm text-primary'
                : 'flex flex-col items-center gap-2 py-4 px-3 border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark-text-94 rounded-xl font-bold text-sm hover:border-slate-300 dark:hover:border-slate-600 transition-colors'"
              @click="setThemeAndPersist('dark')"
            >
              <span class="material-symbols-outlined text-2xl">dark_mode</span>
              <span>深色模式</span>
            </button>
          </div>
        </div>

        <!-- 默认搜索引擎 -->
        <div class="mb-8">
          <label class="block text-sm font-semibold mb-3 text-slate-700 dark-text-94">默认搜索引擎</label>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button
              v-for="eng in SEARCH_ENGINES"
              :key="eng.id"
              type="button"
              :class="currentEngineId === eng.id
                ? 'flex items-center justify-center gap-2 py-3 px-4 border-2 border-primary bg-primary/5 text-primary rounded-xl font-bold text-sm'
                : 'flex items-center justify-center gap-2 py-3 px-4 border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark-text-94 rounded-xl font-bold text-sm hover:border-slate-300 dark:hover:border-slate-600 transition-colors'"
              @click="setDefaultEngine(eng.id)"
            >
              {{ eng.name }}
            </button>
          </div>
          <p class="mt-2 text-xs text-slate-400 dark-text-94">搜索栏中也可临时切换引擎，此处设置的是默认选项。</p>
        </div>

        <!-- 链接打开方式 -->
        <div>
          <label class="block text-sm font-semibold mb-3 text-slate-700 dark-text-94">链接打开方式</label>
          <div class="grid grid-cols-2 gap-3">
            <button
              type="button"
              :class="linkOpenMode === 'newTab'
                ? 'flex items-center justify-center gap-2 py-3 px-4 border-2 border-primary bg-primary/5 text-primary rounded-xl font-bold text-sm'
                : 'flex items-center justify-center gap-2 py-3 px-4 border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark-text-94 rounded-xl font-bold text-sm hover:border-slate-300 dark:hover:border-slate-600 transition-colors'"
              @click="setLinkOpenMode('newTab')"
            >
              <span class="material-symbols-outlined text-lg">open_in_new</span>
              新标签页
            </button>
            <button
              type="button"
              :class="linkOpenMode === 'currentTab'
                ? 'flex items-center justify-center gap-2 py-3 px-4 border-2 border-primary bg-primary/5 text-primary rounded-xl font-bold text-sm'
                : 'flex items-center justify-center gap-2 py-3 px-4 border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark-text-94 rounded-xl font-bold text-sm hover:border-slate-300 dark:hover:border-slate-600 transition-colors'"
              @click="setLinkOpenMode('currentTab')"
            >
              <span class="material-symbols-outlined text-lg">open_in_browser</span>
              当前页面
            </button>
          </div>
        </div>
      </section>

      <!-- ═══════ 修改密码 ═══════ -->
      <section id="password" class="settings-section-card bg-white rounded-xl border border-slate-200 dark:border-white/20 p-4 sm:p-6 md:p-8 mb-6 sm:mb-8">
        <div class="flex items-center gap-3 mb-6">
          <div class="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <span class="material-symbols-outlined">lock</span>
          </div>
          <div>
            <h2 class="text-xl font-bold text-slate-900 dark-text-94">修改密码</h2>
            <p class="text-sm text-slate-500 dark-text-94">更换主人密码，下次登录时使用新密码。</p>
          </div>
        </div>
        <form @submit.prevent="submitChangePassword" class="space-y-4 max-w-md">
          <div>
            <label class="block text-sm font-semibold mb-2 text-slate-700 dark-text-94">当前密码</label>
            <input
              v-model="currentPassword"
              type="password"
              autocomplete="current-password"
              class="settings-input dark-text-94 w-full px-4 py-3 bg-slate-50 border border-slate-200 dark:border-white/20 rounded-xl focus:ring-primary focus:border-primary text-slate-900 dark:text-white"
              placeholder="当前密码"
              :disabled="passwordLoading"
            />
          </div>
          <div>
            <label class="block text-sm font-semibold mb-2 text-slate-700 dark-text-94">新密码</label>
            <input
              v-model="newPassword"
              type="password"
              autocomplete="new-password"
              class="settings-input dark-text-94 w-full px-4 py-3 bg-slate-50 border border-slate-200 dark:border-white/20 rounded-xl focus:ring-primary focus:border-primary text-slate-900 dark:text-white"
              placeholder="至少 4 位"
              :disabled="passwordLoading"
            />
          </div>
          <div>
            <label class="block text-sm font-semibold mb-2 text-slate-700 dark-text-94">确认新密码</label>
            <input
              v-model="confirmPassword"
              type="password"
              autocomplete="new-password"
              class="settings-input dark-text-94 w-full px-4 py-3 bg-slate-50 border border-slate-200 dark:border-white/20 rounded-xl focus:ring-primary focus:border-primary text-slate-900 dark:text-white"
              placeholder="再次输入新密码"
              :disabled="passwordLoading"
            />
          </div>
          <p v-if="passwordError" class="text-sm text-red-500 dark:text-red-400">{{ passwordError }}</p>
          <p v-if="passwordSuccess" class="text-sm text-green-600 dark:text-green-400">{{ passwordSuccess }}</p>
          <button
            type="submit"
            class="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="passwordLoading"
          >
            {{ passwordLoading ? '提交中…' : '修改密码' }}
          </button>
        </form>
      </section>

      <!-- ═══════ AI 助手 ═══════ -->
      <section id="ai-chat" class="settings-section-card bg-white rounded-xl border border-slate-200 dark:border-white/20 p-4 sm:p-6 md:p-8 mb-6 sm:mb-8">
        <div class="flex items-center gap-3 mb-6">
          <div class="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <span class="material-symbols-outlined">auto_awesome</span>
          </div>
          <div>
            <h2 class="text-xl font-bold text-slate-900 dark-text-94">AI 助手</h2>
            <p class="text-sm text-slate-500 dark-text-94">配置 LLM 服务商，驱动 AI 对话、自动归类与励志语生成。</p>
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
          <div class="md:col-span-2">
            <div class="p-4 rounded-xl bg-primary/5 dark:bg-primary/10 border border-primary/15 dark:border-primary/20">
              <p class="text-xs text-slate-600 dark-text-94 leading-relaxed">
                <span class="font-semibold text-primary">AI 功能说明：</span>
                配置完成后，以下功能将自动启用 —— 侧边栏 AI 对话、未分类书签 AI 自动归类、顶部栏 AI 励志语生成、分类编辑 AI 生成说明。API Key 仅加密存储在云端，前端不会读取。
              </p>
            </div>
          </div>
          <div class="md:col-span-2 flex items-center justify-end gap-3 mt-2">
            <button
              type="button"
              class="flex items-center gap-2 py-3 px-6 rounded-xl border-2 border-indigo-500/30 dark:border-indigo-400/30 text-indigo-600 dark:text-indigo-400 font-bold transition-all hover:bg-indigo-50 dark:hover:bg-indigo-500/10 disabled:opacity-50"
              :disabled="testingAi"
              @click="testAiConnection"
            >
              <span class="material-symbols-outlined text-lg" :class="testingAi && 'animate-spin'">{{ testingAi ? 'progress_activity' : 'science' }}</span>
              {{ testingAi ? '测试中…' : '测试连接' }}
            </button>
            <button type="submit" class="bg-indigo-500 dark:bg-indigo-400 hover:bg-indigo-600 dark:hover:bg-indigo-300 text-white font-bold py-3 px-8 rounded-xl transition-all shadow-lg shadow-indigo-500/25 disabled:opacity-50" :disabled="saving">
              {{ saving ? '保存中…' : '保存更改' }}
            </button>
          </div>
          <span v-if="saved" class="md:col-span-2 text-sm text-green-600 dark:text-green-400 text-right">已保存</span>
          <p v-if="saveAiError" class="md:col-span-2 text-sm text-red-600 dark:text-red-400">{{ saveAiError }}</p>
          <!-- 测试结果 -->
          <div v-if="testAiResult" class="md:col-span-2">
            <div
              class="p-4 rounded-xl border flex items-start gap-3"
              :class="testAiResult === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20'
                : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20'"
            >
              <span
                class="material-symbols-outlined text-xl shrink-0 mt-0.5"
                :class="testAiResult === 'success' ? 'text-emerald-500' : 'text-red-500'"
              >{{ testAiResult === 'success' ? 'check_circle' : 'error' }}</span>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold" :class="testAiResult === 'success' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'">
                  {{ testAiResult === 'success' ? '连接成功' : '连接失败' }}
                </p>
                <p class="text-xs mt-1 break-all" :class="testAiResult === 'success' ? 'text-emerald-600 dark:text-emerald-400/80' : 'text-red-600 dark:text-red-400/80'">
                  {{ testAiMessage }}
                </p>
                <p v-if="testAiResponseTime" class="text-xs mt-1 text-slate-400 dark-text-94">
                  响应时间：{{ testAiResponseTime }}ms
                </p>
              </div>
            </div>
          </div>
        </form>
      </section>

      <!-- ═══════ 天气位置 ═══════ -->
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
              <button v-for="item in weatherCityResults" :key="`${item.name}-${item.lat}-${item.lon}`" type="button" class="w-full text-left px-3 py-2 text-sm hover:bg-slate-200/50 dark:hover:bg-white/10 flex justify-between rounded-lg" @click="selectWeatherCity(item)">
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

      <!-- ═══════ 数据管理 ═══════ -->
      <section id="data" class="settings-section-card bg-white rounded-xl border border-slate-200 dark:border-white/20 p-4 sm:p-6 md:p-8 mb-6 sm:mb-8">
        <div class="flex items-center gap-3 mb-6">
          <div class="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <span class="material-symbols-outlined">import_export</span>
          </div>
          <div>
            <h2 class="text-xl font-bold text-slate-900 dark-text-94">数据管理</h2>
            <p class="text-sm text-slate-500 dark-text-94">备份、迁移或重置您的 OmniNav 数据。</p>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="p-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-center">
            <span class="material-symbols-outlined text-4xl text-slate-300 dark:text-slate-600 mb-3 block">download_for_offline</span>
            <p class="text-sm text-slate-600 dark-text-94 mb-4 font-medium">将所有书签、分类、置顶与设置下载为 JSON。</p>
            <button type="button" class="w-full py-3 bg-slate-900 dark:bg-white dark-text-94 text-white font-bold rounded-xl hover:opacity-90 transition-opacity" @click="exportData">导出 JSON</button>
          </div>
          <div class="p-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-center">
            <span class="material-symbols-outlined text-4xl text-slate-300 dark:text-slate-600 mb-3 block">upload_file</span>
            <p class="text-sm text-slate-600 dark-text-94 mb-4 font-medium">从本地 JSON 备份文件恢复全部数据。</p>
            <button type="button" class="w-full py-3 bg-indigo-500 dark:bg-indigo-400 text-white font-bold rounded-xl hover:bg-indigo-600 dark:hover:bg-indigo-300 transition-all shadow-lg shadow-indigo-500/20" @click="triggerImport">从 JSON 导入</button>
          </div>
        </div>
        <input ref="importFileInput" type="file" accept=".json,application/json" class="hidden" @change="onImportFile" />
        <p v-if="importError" class="mt-4 text-sm text-red-500 dark:text-red-400">{{ importError }}</p>

        <!-- 浏览器书签 -->
        <div class="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
          <h3 class="text-sm font-semibold text-slate-700 dark-text-94 mb-1 flex items-center gap-2">
            <span class="material-symbols-outlined text-lg text-primary">language</span>
            浏览器书签
          </h3>
          <p class="text-xs text-slate-500 dark-text-94 mb-4">支持 Chrome / Edge / Firefox 等导出的标准书签 HTML 文件。导入时自动识别文件夹为分类，同名分类自动合并。</p>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="p-5 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-center">
              <span class="material-symbols-outlined text-3xl text-slate-300 dark:text-slate-600 mb-2 block">upload</span>
              <p class="text-sm text-slate-600 dark-text-94 mb-3 font-medium">从浏览器书签 HTML 导入</p>
              <button type="button" class="w-full py-2.5 bg-indigo-500 dark:bg-indigo-400 text-white font-bold rounded-xl hover:bg-indigo-600 dark:hover:bg-indigo-300 transition-all shadow-lg shadow-indigo-500/20 text-sm" @click="triggerBrowserImport">选择 HTML 文件</button>
            </div>
            <div class="p-5 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-center">
              <span class="material-symbols-outlined text-3xl text-slate-300 dark:text-slate-600 mb-2 block">download</span>
              <p class="text-sm text-slate-600 dark-text-94 mb-3 font-medium">导出为浏览器书签 HTML</p>
              <button type="button" class="w-full py-2.5 bg-slate-900 dark:bg-white dark-text-94 text-white font-bold rounded-xl hover:opacity-90 transition-opacity text-sm" @click="exportBrowserBookmarks">导出 HTML</button>
            </div>
          </div>
          <input ref="browserImportFileInput" type="file" accept=".html,.htm,text/html" class="hidden" @change="onBrowserImportFile" />
          <p v-if="browserImportResult" class="mt-3 text-sm" :class="browserImportResult.includes('导入') ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'">{{ browserImportResult }}</p>
        </div>

        <!-- Sun-Panel 导入 -->
        <div class="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
          <h3 class="text-sm font-semibold text-slate-700 dark-text-94 mb-1 flex items-center gap-2">
            <span class="material-symbols-outlined text-lg text-primary">dashboard</span>
            从 Sun-Panel 导入
          </h3>
          <p class="text-xs text-slate-500 dark-text-94 mb-4">支持 Sun-Panel 导出的 JSON 配置文件。分组将映射为分类，同名分类自动合并，重复 URL 自动跳过。</p>
          <div class="flex items-center gap-4">
            <button type="button" class="py-2.5 px-6 bg-indigo-500 dark:bg-indigo-400 text-white font-bold rounded-xl hover:bg-indigo-600 dark:hover:bg-indigo-300 transition-all shadow-lg shadow-indigo-500/20 text-sm" @click="triggerSunPanelImport">选择 JSON 文件</button>
          </div>
          <input ref="sunPanelImportFileInput" type="file" accept=".json,application/json" class="hidden" @change="onSunPanelImportFile" />
          <p v-if="sunPanelImportResult" class="mt-3 text-sm" :class="sunPanelImportResult.includes('导入') ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'">{{ sunPanelImportResult }}</p>
        </div>

        <!-- 危险区域 -->
        <div class="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
          <h3 class="text-sm font-semibold text-red-600 dark:text-red-400 mb-3 flex items-center gap-2">
            <span class="material-symbols-outlined text-lg">warning</span>
            危险区域
          </h3>
          <p class="text-sm text-slate-600 dark-text-94 mb-3">清空所有书签、分类与置顶，并同步到云端。清空后页面将刷新，仅保留一个「未分类」区域。此操作不可撤销。</p>
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

      <!-- ═══════ 关于 ═══════ -->
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
            <li><strong>常用区</strong>：置顶高频书签，无数量上限，编辑布局下拖拽排序</li>
            <li><strong>分类管理</strong>：多分类卡片、私密分类（密码保护）、拖拽排序、分类说明（AI 可生成）</li>
            <li><strong>搜索</strong>：聚合搜索（网页 + 书签），多引擎切换，@ 或 Tab 快速进入书签模式</li>
            <li><strong>AI 助手</strong>：右侧抽屉对话、未分类书签 AI 自动归类（支持深度分析）、励志语生成</li>
            <li><strong>未分类</strong>：独立区域，支持添加、导入浏览器书签 HTML、检测并清理失效链接</li>
            <li><strong>天气与时钟</strong>：顶部栏实时天气（自动/手动定位）与时钟</li>
            <li><strong>主题</strong>：浅色 / 深色 / 跟随系统三种模式</li>
            <li><strong>数据</strong>：云端同步（Cloudflare KV）、JSON 导入导出</li>
          </ul>
          <p class="pt-2 text-slate-500 dark:text-slate-400 text-xs">技术栈：Vue 3 + Vite + Tailwind CSS v4 + Pinia；Hono on Cloudflare Pages；存储 KV。</p>
        </div>
      </section>
    </div>

    <!-- ═══════ 弹窗 ═══════ -->
    <Teleport to="body">
      <!-- 导入确认 -->
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
              <button type="button" class="px-3 py-1.5 rounded-xl text-slate-600 dark-text-94 hover:bg-slate-200/50 dark:hover:bg-white/10" @click="cancelImport">取消</button>
              <button type="button" class="px-3 py-1.5 rounded-xl bg-indigo-500 dark:bg-indigo-400 text-white font-medium hover:bg-indigo-600 dark:hover:bg-indigo-300" @click="confirmImport">确认导入</button>
            </div>
          </div>
        </div>
      </Transition>
      <!-- 浏览器书签导入确认 -->
      <Transition name="modal">
        <div
          v-if="browserImportConfirm"
          class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          @click.self="cancelBrowserImport"
        >
          <div
            class="settings-modal-card w-full max-w-sm rounded-xl bg-white shadow-xl p-5 border border-slate-200 dark:border-white/20"
            @click.stop
          >
            <h3 class="text-lg font-medium text-slate-800 dark-text-94 mb-2">确认导入浏览器书签</h3>
            <p class="text-sm text-slate-600 dark-text-94 mb-3">
              解析到 <strong class="text-primary">{{ browserImportSummary.folders }}</strong> 个文件夹、<strong class="text-primary">{{ browserImportSummary.links }}</strong> 个书签。
            </p>
            <ul class="text-xs text-slate-500 dark-text-94 space-y-1 mb-4 pl-1">
              <li>· 文件夹将映射为分类，同名分类自动合并</li>
              <li>· 不在文件夹下的书签归入「未分类」</li>
              <li>· 已存在的相同 URL 将自动跳过</li>
            </ul>
            <div class="flex justify-end gap-2">
              <button type="button" class="px-3 py-1.5 rounded-xl text-slate-600 dark-text-94 hover:bg-slate-200/50 dark:hover:bg-white/10" @click="cancelBrowserImport">取消</button>
              <button type="button" class="px-3 py-1.5 rounded-xl bg-indigo-500 dark:bg-indigo-400 text-white font-medium hover:bg-indigo-600 dark:hover:bg-indigo-300 disabled:opacity-50" :disabled="browserImportLoading" @click="confirmBrowserImport">
                {{ browserImportLoading ? '导入中…' : '确认导入' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
      <!-- Sun-Panel 导入确认 -->
      <Transition name="modal">
        <div
          v-if="sunPanelImportConfirm"
          class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          @click.self="cancelSunPanelImport"
        >
          <div
            class="settings-modal-card w-full max-w-sm rounded-xl bg-white shadow-xl p-5 border border-slate-200 dark:border-white/20"
            @click.stop
          >
            <h3 class="text-lg font-medium text-slate-800 dark-text-94 mb-2">确认导入 Sun-Panel 数据</h3>
            <p class="text-sm text-slate-600 dark-text-94 mb-3">
              解析到 <strong class="text-primary">{{ sunPanelImportSummary.groups }}</strong> 个分组、<strong class="text-primary">{{ sunPanelImportSummary.items }}</strong> 个图标卡片。
            </p>
            <ul class="text-xs text-slate-500 dark-text-94 space-y-1 mb-4 pl-1">
              <li>· 分组将映射为分类，同名分类自动合并</li>
              <li>· 无分组的卡片归入「未分类」</li>
              <li>· 已存在的相同 URL 将自动跳过</li>
            </ul>
            <div class="flex justify-end gap-2">
              <button type="button" class="px-3 py-1.5 rounded-xl text-slate-600 dark-text-94 hover:bg-slate-200/50 dark:hover:bg-white/10" @click="cancelSunPanelImport">取消</button>
              <button type="button" class="px-3 py-1.5 rounded-xl bg-indigo-500 dark:bg-indigo-400 text-white font-medium hover:bg-indigo-600 dark:hover:bg-indigo-300 disabled:opacity-50" :disabled="sunPanelImportLoading" @click="confirmSunPanelImport">
                {{ sunPanelImportLoading ? '导入中…' : '确认导入' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
      <!-- 清空确认 -->
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
            <h3 class="text-lg font-medium text-slate-800 dark-text-94 mb-2">确认清空</h3>
            <p class="text-sm text-slate-600 dark-text-94 mb-4">
              将清空所有书签、分类与置顶，并同步到云端。清空后页面会刷新，仅保留「未分类」区域。此操作不可撤销，是否继续？
            </p>
            <div class="flex justify-end gap-2">
              <button type="button" class="px-3 py-1.5 rounded-xl text-slate-600 dark-text-94 hover:bg-slate-200/50 dark:hover:bg-white/10" @click="clearAllConfirm = false">取消</button>
              <button type="button" class="px-3 py-1.5 rounded-xl bg-red-600 text-white font-medium hover:bg-red-500" :disabled="clearAllLoading" @click="clearAllData">清空</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
