<script setup lang="ts">
import { computed } from 'vue'
import { useSyncStore } from '@/stores/sync'
import type { SyncStatus } from '@/stores/sync'

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
</script>

<template>
  <footer class="footer shrink-0 z-30 px-3 sm:px-4 md:px-6 py-3 md:py-4" style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom));">
    <div class="max-w-5xl mx-auto flex items-center justify-center rounded-2xl glass-translucent px-4 md:px-5 h-12 md:h-14 text-[10px] md:text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-300">
      <div class="flex items-center gap-2" :class="{ 'text-amber-600 dark:text-amber-400': syncStore.displayStatus === 'offline' }">
        <span class="material-symbols-outlined text-base" :class="syncStore.displayStatus === 'offline' ? 'text-amber-500 dark:text-amber-400' : 'text-indigo-500 dark:text-indigo-400'">{{ syncIcon }}</span>
        <span>{{ syncLabel }}</span>
      </div>
    </div>
  </footer>
</template>
