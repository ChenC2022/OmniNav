import { defineStore } from 'pinia'
import { ref } from 'vue'

/** 已解锁的私密分类 ID 集合（仅当前会话，不持久化） */
export const usePrivateCategoriesStore = defineStore('privateCategories', () => {
  const unlockedIds = ref<Set<string>>(new Set())

  function unlock(id: string) {
    unlockedIds.value = new Set([...unlockedIds.value, id])
  }

  function isUnlocked(id: string) {
    return unlockedIds.value.has(id)
  }

  return { unlockedIds, unlock, isUnlocked }
})
