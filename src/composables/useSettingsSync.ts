import { onMounted, ref } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useSettingsStore } from '@/stores/settings'
import type { ThemeMode } from '@/types'

const SETTINGS_KEY = '/api/data/settings'

async function fetchSettings(): Promise<Record<string, unknown>> {
  const res = await fetch(SETTINGS_KEY)
  if (!res.ok) return {}
  const json = await res.json().catch(() => ({}))
  return (json.data as Record<string, unknown>) ?? {}
}

async function saveSettings(data: Record<string, unknown>): Promise<void> {
  await fetch(SETTINGS_KEY, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function useSettingsSync() {
  const ui = useUiStore()
  const settings = useSettingsStore()
  const initialLoadDone = ref(false)

  onMounted(async () => {
    const data = await fetchSettings()
    settings.setSettings(data)
    const t = data.theme as ThemeMode | undefined
    if (t === 'light' || t === 'dark' || t === 'system') ui.setTheme(t)
    initialLoadDone.value = true
  })

  async function persistTheme() {
    if (!initialLoadDone.value) return
    const data = { ...settings.data, theme: ui.theme }
    settings.patchSettings({ theme: ui.theme })
    await saveSettings(data as Record<string, unknown>)
  }

  async function persistSettings() {
    if (!initialLoadDone.value) return
    const data = { ...settings.data, theme: ui.theme } as Record<string, unknown>
    await saveSettings(data)
  }

  return { persistTheme, persistSettings }
}
