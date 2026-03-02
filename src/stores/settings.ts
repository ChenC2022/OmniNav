import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Settings } from '@/types'

export const useSettingsStore = defineStore('settings', () => {
  const data = ref<Settings>({})

  function setSettings(s: Partial<Settings> | Record<string, unknown>) {
    data.value = { ...data.value, ...s } as Settings
  }

  function patchSettings(patch: Partial<Settings>) {
    data.value = { ...data.value, ...patch }
  }

  return {
    data,
    setSettings,
    patchSettings,
  }
})
