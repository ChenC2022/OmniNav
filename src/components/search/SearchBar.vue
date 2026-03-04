<script setup lang="ts">
import { ref, computed, inject, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import { useBookmarksStore } from '@/stores/bookmarks'
import { useCategoriesStore } from '@/stores/categories'
import { SEARCH_ENGINES, getSearchUrl } from '@/constants/searchEngines'
import { faviconUrl } from '@/utils/favicon'
import type { Bookmark } from '@/types'

const settings = useSettingsStore()
const ui = useUiStore()
const { triggerBookmarkSearch } = storeToRefs(ui)
const bookmarksStore = useBookmarksStore()
const categoriesStore = useCategoriesStore()
const persistSettings = inject<() => Promise<void>>('persistSettings')

const query = ref('')
const showEngineDropdown = ref(false)
const inputEl = ref<HTMLInputElement | null>(null)
const selectedBookmarkIndex = ref(0)

const currentEngineId = computed(() => settings.data.defaultSearchEngine ?? 'google')
const currentEngine = computed(() => SEARCH_ENGINES.find((e) => e.id === currentEngineId.value) ?? SEARCH_ENGINES[0])

/** 以 @ 开头为书签模式 */
const isBookmarkMode = computed(() => query.value.trim().startsWith('@'))
/** 仅在网页搜索模式下显示搜索引擎选择（书签模式不显示） */
const showEngineSelector = computed(() => !isBookmarkMode.value)
const bookmarkQuery = computed(() => {
  const t = query.value.trim()
  return t.startsWith('@') ? t.slice(1).trim().toLowerCase() : ''
})

/** 多关键词（空格分隔），用于 AND 收窄召回 */
const bookmarkTokens = computed(() => bookmarkQuery.value.split(/\s+/).filter(Boolean))

/** 分类名缓存：categoryId -> lowerCase(name) */
const categoryNameLowerById = computed(() => {
  const m = new Map<string, string>()
  for (const c of categoriesStore.items) {
    if (c?.id) m.set(c.id, (c.name ?? '').toLowerCase())
  }
  return m
})

const filteredBookmarks = computed(() => {
  const tokens = bookmarkTokens.value
  if (tokens.length === 0) return bookmarksStore.items

  const catNameMap = categoryNameLowerById.value

  type Ranked = { b: Bookmark; worstRank: number; sumRank: number }

  const ranked: Ranked[] = []

  for (const b of bookmarksStore.items) {
    const title = b.title.toLowerCase()
    const url = b.url.toLowerCase()
    const desc = b.description ? b.description.toLowerCase() : ''
    const cat = catNameMap.get(b.categoryId) ?? ''

    // 每个 token 必须命中任一字段；并记录该 token 的命中“最佳”字段 rank
    let worstRank = 0
    let sumRank = 0
    let ok = true

    for (const q of tokens) {
      let r = 4
      if (title.includes(q)) r = 0
      else if (desc && desc.includes(q)) r = 1
      else if (url.includes(q)) r = 2
      else if (cat && cat.includes(q)) r = 3

      if (r === 4) {
        ok = false
        break
      }
      worstRank = Math.max(worstRank, r)
      sumRank += r
    }

    if (ok) ranked.push({ b, worstRank, sumRank })
  }

  // 排序优先级：标题 > 描述 > URL > 分类；多关键词时先比较“最差命中字段”，再比较总和
  ranked.sort((a, b) => (a.worstRank - b.worstRank) || (a.sumRank - b.sumRank))
  return ranked.map((x) => x.b)
})
const displayBookmarks = computed(() => filteredBookmarks.value.slice(0, 20))

function getCategoryName(categoryId: string) {
  return categoriesStore.items.find((c) => c.id === categoryId)?.name ?? ''
}

watch(triggerBookmarkSearch, (v) => {
  if (!v) return
  query.value = '@ '
  showEngineDropdown.value = false
  nextTick(() => {
    inputEl.value?.focus()
    selectedBookmarkIndex.value = 0
  })
  ui.setTriggerBookmarkSearch(false)
})

watch(displayBookmarks, () => {
  selectedBookmarkIndex.value = Math.min(selectedBookmarkIndex.value, Math.max(0, displayBookmarks.value.length - 1))
})

async function selectEngine(id: string) {
  settings.patchSettings({ defaultSearchEngine: id })
  showEngineDropdown.value = false
  await persistSettings?.()
}

function openBookmark(b: Bookmark) {
  window.open(b.url, '_blank', 'noopener')
  query.value = ''
}

function submit() {
  const q = query.value.trim()
  if (!q) return
  if (isBookmarkMode.value) {
    const list = displayBookmarks.value
    const b = list[selectedBookmarkIndex.value]
    if (b) {
      openBookmark(b)
    }
    return
  }
  const url = getSearchUrl(currentEngineId.value, q)
  window.open(url, '_blank', 'noopener')
  query.value = ''
}

function closeDropdowns() {
  showEngineDropdown.value = false
  if (isBookmarkMode.value) query.value = ''
}

/** 点击模式标签切换网页/书签搜索 */
function toggleSearchMode() {
  if (isBookmarkMode.value) {
    query.value = bookmarkQuery.value
  } else {
    showEngineDropdown.value = false
    const t = query.value.trim()
    query.value = t ? `@ ${t}` : '@ '
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Tab') {
    e.preventDefault()
    toggleSearchMode()
    return
  }
  if (e.key === 'Escape') {
    showEngineDropdown.value = false
    if (isBookmarkMode.value) query.value = ''
    e.preventDefault()
    return
  }
  if (!isBookmarkMode.value) return
  if (e.key === 'ArrowDown') {
    selectedBookmarkIndex.value = Math.min(selectedBookmarkIndex.value + 1, displayBookmarks.value.length - 1)
    e.preventDefault()
    return
  }
  if (e.key === 'ArrowUp') {
    selectedBookmarkIndex.value = Math.max(selectedBookmarkIndex.value - 1, 0)
    e.preventDefault()
    return
  }
  if (e.key === 'Enter' && displayBookmarks.value.length > 0) {
    const b = displayBookmarks.value[selectedBookmarkIndex.value]
    if (b) {
      openBookmark(b)
      e.preventDefault()
    }
  }
}
</script>

<template>
  <div class="relative flex flex-1 min-w-0 w-full max-w-2xl mx-1 sm:mx-2 md:mx-8">
    <form
      class="search-bar-form relative flex flex-1 rounded-xl border border-slate-200/80 dark:border-white/20 bg-white/95 overflow-visible h-[3rem] focus-within:ring-2 focus-within:ring-indigo-400/50 focus-within:border-indigo-400/50 transition-all duration-200 flex items-center pl-3"
      @submit.prevent="submit"
      @keydown="onKeydown"
    >
      <button
        type="button"
        class="search-mode-tag flex items-center gap-1.5 shrink-0 h-6 px-2.5 rounded-full text-xs font-medium border transition-colors cursor-pointer"
        :class="isBookmarkMode ? 'search-mode-tag--bookmark' : 'search-mode-tag--web'"
        :title="isBookmarkMode ? '当前：书签搜索（点击切换为网页搜索）' : '当前：网页搜索（点击切换为书签搜索）'"
        @click="toggleSearchMode"
      >
        <span class="material-symbols-outlined text-base leading-none" aria-hidden="true">
          {{ isBookmarkMode ? 'bookmark' : 'public' }}
        </span>
        <span>{{ isBookmarkMode ? '书签' : '网页' }}</span>
      </button>
      <input
        ref="inputEl"
        v-model="query"
        type="text"
        class="search-bar-input flex-1 min-w-0 h-full py-0 pl-2 pr-2 ml-2 bg-transparent text-slate-800 dark:text-white text-sm placeholder-slate-400 dark:placeholder-white/60 focus:outline-none border-0"
        :placeholder="isBookmarkMode ? '空格分隔多关键词可收窄结果，支持标题、说明、链接、分类' : '搜索网页或 @ 搜索书签，Tab 可快速切换'"
        autocomplete="off"
        aria-label="搜索"
      />
      <button
        v-if="showEngineSelector"
        type="button"
        class="search-bar-engine flex items-center gap-1 px-3 h-full text-xs font-medium text-slate-500 dark:text-white hover:bg-slate-200/5 dark:hover:bg-white/5 shrink-0 transition-colors cursor-pointer"
        title="切换搜索引擎（仅网页搜索时生效）"
        @click="showEngineDropdown = !showEngineDropdown"
      >
        {{ currentEngine.name }} ▾
      </button>
    </form>
    <!-- 引擎选择下拉（仅网页搜索模式） -->
    <div
      v-show="showEngineDropdown && showEngineSelector"
      class="search-dropdown absolute top-full left-0 right-0 mt-2 p-2 rounded-xl border border-slate-200 dark:border-white/20 shadow-xl z-20 bg-white dark:bg-slate-900"
    >
      <button
        v-for="eng in SEARCH_ENGINES"
        :key="eng.id"
        type="button"
        class="search-dropdown-item w-full px-3 py-2.5 text-left text-sm font-medium transition-colors cursor-pointer rounded-lg"
        :class="currentEngineId === eng.id ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300' : 'text-slate-700 dark:text-white hover:bg-slate-200/5 dark:hover:bg-white/5'"
        @click="selectEngine(eng.id); showEngineDropdown = false"
      >
        {{ eng.name }}
      </button>
    </div>
    <!-- 书签结果下拉（@ 模式） -->
    <div
      v-show="isBookmarkMode"
      class="search-dropdown search-bookmark-dropdown custom-scrollbar absolute top-full left-0 right-0 mt-2 py-2 rounded-xl border border-slate-200 dark:border-white/20 shadow-xl z-20 bg-white dark:bg-slate-900 max-h-[60vh] overflow-y-auto"
    >
      <!-- 使用提示 -->
      <p class="px-3 pt-1 pb-2 text-xs text-slate-400 dark:text-white/35 border-b border-slate-100 dark:border-white/10 mb-1">
        支持标题、说明、链接、分类名 · 空格分隔多关键词可收窄结果
      </p>
      <template v-if="displayBookmarks.length">
        <button
          v-for="(b, idx) in displayBookmarks"
          :key="b.id"
          type="button"
          class="w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors cursor-pointer rounded-lg"
          :class="selectedBookmarkIndex === idx ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300' : 'text-slate-700 dark:text-white hover:bg-slate-200/5 dark:hover:bg-white/5'"
          @click="openBookmark(b)"
          @mouseenter="selectedBookmarkIndex = idx"
        >
          <div class="flex items-center gap-3 min-w-0">
            <div class="size-8 rounded-lg bg-indigo-500/20 dark:bg-indigo-400/20 flex items-center justify-center shrink-0 overflow-hidden">
              <img
                :src="faviconUrl(b.url, 24)"
                :alt="''"
                width="20"
                height="20"
                class="rounded object-contain"
                @error="(e) => ((e.target as HTMLImageElement).style.display = 'none')"
              />
            </div>
            <div class="flex flex-col min-w-0">
              <span class="font-medium text-sm text-slate-900 dark-text-94 truncate">{{ b.title }}</span>
              <span class="text-xs text-slate-500 dark-text-94 truncate opacity-90">{{ getCategoryName(b.categoryId) }} · {{ b.url }}</span>
            </div>
          </div>
        </button>
      </template>
      <p v-else class="px-3 py-4 text-center text-sm text-slate-500 dark-text-94">
        {{ bookmarkQuery ? '无匹配书签' : '输入关键词搜索书签' }}
      </p>
    </div>
    <div v-show="showEngineDropdown || isBookmarkMode" class="fixed inset-0 z-10" @click="closeDropdowns" />
  </div>
</template>
