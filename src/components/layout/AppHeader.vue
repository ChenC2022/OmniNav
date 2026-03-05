<script setup lang="ts">
import { ref, computed, provide, inject } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import ClockWidget from './ClockWidget.vue'
import WeatherWidget from './WeatherWidget.vue'
import SearchBar from '@/components/search/SearchBar.vue'
import { useUiStore } from '@/stores/ui'
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

const headerCityName = ref('')

provide('setHeaderCityName', (name: string) => {
  headerCityName.value = name
})

async function logout() {
  await apiFetch('/api/auth/logout', { method: 'POST' })
  router.push('/login')
}
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
          <img src="/logo.svg" alt="OmniNav" class="size-9 rounded-xl shadow-lg" />
          <span class="text-slate-800 dark-text-94 text-lg font-bold leading-tight tracking-tight hidden sm:inline">OmniNav</span>
        </RouterLink>
        <span v-if="headerCityName" class="text-sm font-medium text-slate-500 dark-text-94 shrink-0 truncate hidden md:inline">{{ headerCityName }}</span>
        <ClockWidget />
        <WeatherWidget />
      </div>
      <div class="header-center flex-1 min-w-0 flex items-center justify-center max-w-2xl min-w-0 px-2 hidden sm:flex">
        <SearchBar />
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
