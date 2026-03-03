<script setup lang="ts">
import { provide, ref, watch, onMounted, onUnmounted } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useSettingsStore } from '@/stores/settings'
import { useSyncStore } from '@/stores/sync'
import { useSettingsSync } from '@/composables/useSettingsSync'
import { useDataSync } from '@/composables/useDataSync'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppDrawer from '@/components/layout/AppDrawer.vue'
import AppFooter from '@/components/layout/AppFooter.vue'

const ui = useUiStore()
const settings = useSettingsStore()
const syncStore = useSyncStore()
const { persistTheme, persistSettings } = useSettingsSync()
const { saveBookmarks, saveCategories, savePinned } = useDataSync()
provide('persistTheme', persistTheme)
provide('persistSettings', persistSettings)
provide('saveBookmarks', saveBookmarks)
provide('saveCategories', saveCategories)
provide('savePinned', savePinned)

function updateOnline() {
  syncStore.setOnline(navigator.onLine)
}
function onGlobalKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    ui.setTriggerBookmarkSearch(true)
  }
}
onMounted(() => {
  updateOnline()
  window.addEventListener('online', updateOnline)
  window.addEventListener('offline', updateOnline)
  window.addEventListener('keydown', onGlobalKeydown)
})
onUnmounted(() => {
  window.removeEventListener('online', updateOnline)
  window.removeEventListener('offline', updateOnline)
  window.removeEventListener('keydown', onGlobalKeydown)
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
      </main>
      <AppDrawer />
      <AppFooter />
    </div>
  </div>
</template>
