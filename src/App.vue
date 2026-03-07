<script setup lang="ts">
import { provide, computed, watch, onMounted, onUnmounted } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useSettingsStore } from '@/stores/settings'
import { useSyncStore } from '@/stores/sync'
import { useSettingsSync } from '@/composables/useSettingsSync'
import { useDataSync } from '@/composables/useDataSync'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppDrawer from '@/components/layout/AppDrawer.vue'
import type { SyncStatus } from '@/stores/sync'
import BackToTop from '@/components/common/BackToTop.vue'

const syncStore = useSyncStore()
const syncLabel = computed(() => {
  const s: SyncStatus = syncStore.displayStatus
  if (s === 'offline') return '离线'
  if (s === 'syncing') return '同步中…'
  return '已与云端同步'
})
const syncIcon = computed(() => {
  const s: SyncStatus = syncStore.displayStatus
  if (s === 'offline') return 'cloud_off'
  if (s === 'syncing') return 'sync'
  return 'cloud_done'
})

const ui = useUiStore()
const { persistTheme, persistSettings } = useSettingsSync()
const { loadData, saveBookmarks, saveCategories, savePinned } = useDataSync()
provide('persistTheme', persistTheme)
provide('persistSettings', persistSettings)
provide('loadData', loadData)
provide('saveBookmarks', saveBookmarks)
provide('saveCategories', saveCategories)
provide('savePinned', savePinned)

function updateOnline() {
  syncStore.setOnline(navigator.onLine)
}
onMounted(() => {
  updateOnline()
  window.addEventListener('online', updateOnline)
  window.addEventListener('offline', updateOnline)
})
onUnmounted(() => {
  window.removeEventListener('online', updateOnline)
  window.removeEventListener('offline', updateOnline)
})

watch(
  () => ui.theme,
  (theme) => {
    if (theme === 'dark') document.documentElement.classList.add('dark')
    else if (theme === 'light') document.documentElement.classList.remove('dark')
    else {
      const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
      document.documentElement.classList.toggle('dark', dark)
    }
  },
  { immediate: true }
)
</script>

<template>
  <div class="min-h-screen flex flex-col relative bg-transparent">
    <div class="relative z-10 flex flex-col min-h-screen h-screen overflow-hidden">
      <AppHeader />
      <main class="main custom-scrollbar flex-1 min-h-0 overflow-auto pt-4 sm:pt-6 pb-8 px-3 sm:px-4 md:px-6" style="padding-bottom: max(2rem, env(safe-area-inset-bottom));">
        <router-view />
        <p class="mt-8 mb-2 text-center text-[10px] md:text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center justify-center gap-1.5" :class="{ 'text-amber-500 dark:text-amber-400': syncStore.displayStatus === 'offline' }">
          <span class="material-symbols-outlined text-sm" :class="syncStore.displayStatus === 'offline' ? 'text-amber-500 dark:text-amber-400' : 'text-indigo-500 dark:text-indigo-400'">{{ syncIcon }}</span>
          <span>{{ syncLabel }}</span>
        </p>
      </main>
      <AppDrawer />
      <BackToTop trigger-selector=".pinned-section" />
    </div>
  </div>
</template>
