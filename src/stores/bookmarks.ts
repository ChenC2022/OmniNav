import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Bookmark } from '@/types'

export const useBookmarksStore = defineStore('bookmarks', () => {
  const items = ref<Bookmark[]>([])

  function setBookmarks(list: Bookmark[]) {
    items.value = list
  }

  function addBookmark(bookmark: Bookmark) {
    items.value.push(bookmark)
  }

  function updateBookmark(id: string, patch: Partial<Bookmark>) {
    const i = items.value.findIndex((b) => b.id === id)
    if (i >= 0) items.value[i] = { ...items.value[i], ...patch }
  }

  function removeBookmark(id: string) {
    items.value = items.value.filter((b) => b.id !== id)
  }

  return {
    items,
    setBookmarks,
    addBookmark,
    updateBookmark,
    removeBookmark,
  }
})
