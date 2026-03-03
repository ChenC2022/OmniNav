<script setup lang="ts">
import { inject, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useSyncStore } from '@/stores/sync'
import type { SyncStatus } from '@/stores/sync'

const ui = useUiStore()
const syncStore = useSyncStore()
const { theme } = storeToRefs(ui)
const persistTheme = inject<() => Promise<void>>('persistTheme')

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
</script>

<template>
  <footer class="footer shrink-0 z-30 px-3 sm:px-4 md:px-6 py-3 md:py-4" style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom));">
    <div class="max-w-5xl mx-auto flex items-center justify-between rounded-2xl glass-translucent px-4 md:px-5 h-12 md:h-14 text-[10px] md:text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-300">
      <div class="flex items-center gap-2" :class="{ 'text-amber-600 dark:text-amber-400': syncStore.displayStatus === 'offline' }">
        <span class="material-symbols-outlined text-base" :class="syncStore.displayStatus === 'offline' ? 'text-amber-500 dark:text-amber-400' : 'text-indigo-500 dark:text-indigo-400'">{{ syncIcon }}</span>
        <span>{{ syncLabel }}</span>
      </div>
      <div class="theme-switcher-wrap flex items-center gap-0.5 p-1 rounded-full glass-translucent border border-slate-200/60 dark:border-white/20">
        <button
          type="button"
          class="theme-switcher-btn px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer"
          :class="theme === 'system' ? 'bg-white/90 dark:bg-white/10 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'"
          title="跟随系统"
          aria-label="主题：跟随系统"
          @click="ui.setTheme('system'); persistTheme?.()"
        >
          系统
        </button>
        <button
          type="button"
          class="theme-switcher-btn px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer"
          :class="theme === 'light' ? 'bg-white/90 dark:bg-white/10 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'"
          title="浅色"
          aria-label="主题：浅色"
          @click="ui.setTheme('light'); persistTheme?.()"
        >
          浅色
        </button>
        <button
          type="button"
          class="theme-switcher-btn px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer"
          :class="theme === 'dark' ? 'bg-indigo-500/90 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-300'"
          title="深色"
          aria-label="主题：深色"
          @click="ui.setTheme('dark'); persistTheme?.()"
        >
          深色
        </button>
      </div>
    </div>
  </footer>
</template>
