import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Category } from '@/types'

export const useCategoriesStore = defineStore('categories', () => {
  const items = ref<Category[]>([])

  function setCategories(list: Category[]) {
    items.value = list
  }

  function addCategory(category: Category) {
    items.value.push(category)
  }

  function updateCategory(id: string, patch: Partial<Category>) {
    const i = items.value.findIndex((c) => c.id === id)
    if (i >= 0) items.value[i] = { ...items.value[i], ...patch }
  }

  function removeCategory(id: string) {
    items.value = items.value.filter((c) => c.id !== id)
  }

  return {
    items,
    setCategories,
    addCategory,
    updateCategory,
    removeCategory,
  }
})
