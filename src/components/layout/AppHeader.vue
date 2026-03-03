<script setup lang="ts">
import { ref, provide } from 'vue'
import { RouterLink } from 'vue-router'
import ClockWidget from './ClockWidget.vue'
import WeatherWidget from './WeatherWidget.vue'
import SearchBar from '@/components/search/SearchBar.vue'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
const headerCityName = ref('')
provide('setHeaderCityName', (name: string) => {
  headerCityName.value = name
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
      <div class="header-center flex-1 min-w-0 flex justify-center max-w-xl min-w-0">
        <SearchBar />
      </div>
      <div class="header-right flex items-center gap-2 shrink-0">
        <button
          type="button"
          class="h-9 md:h-10 px-3 sm:px-4 rounded-xl bg-indigo-500 dark:bg-indigo-400 text-white font-bold text-sm shadow-lg hover:bg-indigo-600 dark:hover:bg-indigo-300 active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer shrink-0"
          title="聚焦搜索并搜索书签（⌘K）"
          aria-label="搜索书签"
          @click="ui.setTriggerBookmarkSearch(true)"
        >
          <span class="font-mono text-sm">⌘K</span>
        </button>
        <button
          type="button"
          class="h-9 md:h-10 px-3 sm:px-4 rounded-xl bg-indigo-500 dark:bg-indigo-400 text-white font-bold text-sm shadow-lg hover:bg-indigo-600 dark:hover:bg-indigo-300 active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer"
          title="AI 对话"
          @click="ui.toggleDrawer()"
        >
          <span class="material-symbols-outlined text-lg">auto_awesome</span>
          <span class="hidden sm:inline">AI</span>
        </button>
        <RouterLink
          to="/settings"
          class="h-9 w-9 md:h-10 md:w-10 rounded-xl flex items-center justify-center glass-translucent text-slate-600 dark:text-white/80 hover:bg-slate-200/5 dark:hover:bg-white/5 transition-all duration-200 cursor-pointer shrink-0"
          aria-label="设置"
        >
          <span class="material-symbols-outlined text-[22px]">settings</span>
        </RouterLink>
      </div>
    </div>
  </header>
</template>
