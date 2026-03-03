import { defineStore } from 'pinia'
import { ref } from 'vue'

/** 当前正在做有效性检测的书签 id，用于状态点闪烁动效 */
export const useHealthCheckStore = defineStore('healthCheck', () => {
  const currentCheckingBookmarkId = ref<string | null>(null)
  return { currentCheckingBookmarkId }
})
