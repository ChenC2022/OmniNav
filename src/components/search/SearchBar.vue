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
const bookmarkQuery = computed(() => {
  const t = query.value.trim()
  return t.startsWith('@') ? t.slice(1).trim().toLowerCase() : ''
})

const filteredBookmarks = computed(() => {
  const q = bookmarkQuery.value
  if (!q) return bookmarksStore.items
  const matched = bookmarksStore.items.filter(
    (b) =>
      b.title.toLowerCase().includes(q) ||
      b.url.toLowerCase().includes(q) ||
      (b.description && b.description.toLowerCase().includes(q))
  )
  // 排序优先级：标题 > 描述 > URL（数字越小越靠前）
  return matched.slice().sort((a, b) => {
    const rank = (x: Bookmark) => {
      const t = x.title.toLowerCase().includes(q)
      const d = x.description?.toLowerCase().includes(q)
      const u = x.url.toLowerCase().includes(q)
      if (t) return 0
      if (d) return 1
      if (u) return 2
      return 3
    }
    return rank(a) - rank(b)
  })
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

function onKeydown(e: KeyboardEvent) {
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
  <div class="relative flex flex-1 min-w-0 max-w-2xl mx-1 sm:mx-2 md:mx-8">
    <form
      class="search-bar-form relative flex flex-1 rounded-xl border border-slate-200/80 dark:border-white/20 bg-white/95 overflow-visible h-10 focus-within:ring-2 focus-within:ring-indigo-400/50 focus-within:border-indigo-400/50 transition-all duration-200 flex items-center"
      @submit.prevent="submit"
      @keydown="onKeydown"
    >
      <span class="pl-3.5 flex items-center shrink-0 pointer-events-none text-slate-400 dark:text-white/80">
        <span class="material-symbols-outlined text-xl leading-[1em] align-middle">search</span>
      </span>
      <input
        ref="inputEl"
        v-model="query"
        type="text"
        class="search-bar-input flex-1 min-w-0 h-full py-0 pl-2 pr-2 bg-transparent text-slate-800 dark:text-white text-sm placeholder-slate-400 dark:placeholder-white/60 focus:outline-none border-0"
        placeholder="搜索网页或 @ 搜索书签…"
        autocomplete="off"
        aria-label="搜索"
      />
      <button
        type="button"
        class="search-bar-engine flex items-center gap-1 px-3 h-full text-xs font-medium text-slate-500 dark:text-white hover:bg-slate-200/5 dark:hover:bg-white/5 shrink-0 transition-colors cursor-pointer"
        title="切换搜索引擎（仅网页搜索时生效）"
        @click="showEngineDropdown = !showEngineDropdown"
      >
        {{ currentEngine.name }} ▾
      </button>
    </form>
    <!-- 引擎选择下拉 -->
    <div
      v-show="showEngineDropdown && !isBookmarkMode"
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
