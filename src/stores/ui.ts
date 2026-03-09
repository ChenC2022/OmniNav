import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ThemeMode } from '@/types'

export const useUiStore = defineStore('ui', () => {
  const drawerOpen = ref(false)
  /** 为 true 时 SearchBar 聚焦并进入书签模式（@），用于 ⌘K 等触发 */
  const triggerBookmarkSearch = ref(false)
  /** 为 true 时显示顶部「快速添加」浮层（由首页消费） */
  const quickAddModalOpen = ref(false)
  const theme = ref<ThemeMode>('system')
  const isEditLayout = ref(false)

  const effectiveTheme = computed(() => {
    if (theme.value === 'dark') return 'dark'
    if (theme.value === 'light') return 'light'
    if (typeof window === 'undefined') return 'light'
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  function toggleDrawer() {
    drawerOpen.value = !drawerOpen.value
  }

  function setTriggerBookmarkSearch(value: boolean) {
    triggerBookmarkSearch.value = value
  }

  function setQuickAddModalOpen(value: boolean) {
    quickAddModalOpen.value = value
  }

  function setTheme(mode: ThemeMode) {
    theme.value = mode
  }

  /** 循环切换：system -> light -> dark -> system */
  function cycleTheme() {
    if (theme.value === 'system') theme.value = 'light'
    else if (theme.value === 'light') theme.value = 'dark'
    else theme.value = 'system'
  }

  return {
    drawerOpen,
    triggerBookmarkSearch,
    setTriggerBookmarkSearch,
    quickAddModalOpen,
    setQuickAddModalOpen,
    theme,
    effectiveTheme,
    toggleDrawer,
    setTheme,
    cycleTheme,
    isEditLayout,
  }
})
