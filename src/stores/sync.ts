import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type SyncStatus = 'idle' | 'syncing' | 'offline'

export const useSyncStore = defineStore('sync', () => {
  const status = ref<SyncStatus>('idle')
  const isOnline = ref(typeof navigator !== 'undefined' ? navigator.onLine : true)

  function setSyncing() {
    status.value = 'syncing'
  }

  function setIdle() {
    status.value = 'idle'
  }

  function setOnline(value: boolean) {
    isOnline.value = value
  }

  /** 用于 Footer 展示：离线优先，否则为 syncing/idle */
  const displayStatus = computed<SyncStatus>(() => {
    if (!isOnline.value) return 'offline'
    return status.value
  })

  return {
    status,
    isOnline,
    displayStatus,
    setSyncing,
    setIdle,
    setOnline,
  }
})
