import { defineStore } from 'pinia'
import { ref } from 'vue'

export const MAX_PINNED = 16

export const usePinnedStore = defineStore('pinned', () => {
  const ids = ref<string[]>([])

  function setIds(list: string[]) {
    ids.value = list
  }

  function add(id: string) {
    if (ids.value.includes(id)) return
    ids.value = [...ids.value, id]
  }

  function remove(id: string) {
    ids.value = ids.value.filter((i) => i !== id)
  }

  function reorder(orderedIds: string[]) {
    ids.value = [...orderedIds]
  }

  function toggle(id: string) {
    if (ids.value.includes(id)) remove(id)
    else add(id)
  }

  return {
    ids,
    setIds,
    add,
    remove,
    reorder,
    toggle,
  }
})
