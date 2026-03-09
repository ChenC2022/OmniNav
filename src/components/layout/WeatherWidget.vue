<script setup lang="ts">
import { ref, computed, onMounted, watch, inject } from 'vue'
import { useSettingsStore } from '@/stores/settings'

const settings = useSettingsStore()
const setHeaderCityName = inject<(name: string) => void>('setHeaderCityName')
const temp = ref<number | null>(null)
const condition = ref<string>('')
const icon = ref<string>('')
const loading = ref(true)
const error = ref(false)

const tempText = computed(() => (temp.value == null ? '' : temp.value.toFixed(1)))

function setCity(name: string) {
  setHeaderCityName?.(name)
}

async function fetchWeather(lat: number, lon: number) {
  loading.value = true
  error.value = false
  try {
    const res = await fetch(`/api/weather?lat=${lat}&lon=${lon}`)
    const json = await res.json().catch(() => ({}))
    if (json.ok && json.temp != null) {
      const t = Number(json.temp)
      temp.value = Number.isFinite(t) ? Math.round(t * 10) / 10 : null
      condition.value = typeof json.text === 'string' ? json.text : ''
      icon.value = typeof json.icon === 'string' ? json.icon : ''
    } else {
      error.value = true
    }
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
}

async function applyAutoLocation() {
  setCity('')
  if (!navigator.geolocation?.getCurrentPosition) {
    await fetchWeather(39.9, 116.4)
    if (settings.data.weather?.mode === 'city') return
    setCity('北京')
    return
  }
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      if (settings.data.weather?.mode === 'city') return
      const lat = pos.coords.latitude
      const lon = pos.coords.longitude
      await fetchWeather(lat, lon)
      if (settings.data.weather?.mode === 'city') return
      try {
        const r = await fetch(`/api/reverse-geocode?lat=${lat}&lon=${lon}`)
        const j = await r.json().catch(() => ({}))
        if (j.ok && j.cityName) setCity(j.cityName)
        else setCity('当前定位')
      } catch {
        setCity('当前定位')
      }
    },
    async () => {
      if (settings.data.weather?.mode === 'city') return
      await fetchWeather(39.9, 116.4)
      if (settings.data.weather?.mode === 'city') return
      setCity('北京')
    }
  )
}

function applyCityLocation(w: NonNullable<typeof settings.data.weather>) {
  const lat = w.lat
  const lon = w.lon
  if (lat != null && lon != null && !Number.isNaN(lat) && !Number.isNaN(lon)) {
    setCity(w.cityName ?? '')
    fetchWeather(lat, lon)
    return
  }
  applyAutoLocation()
}

onMounted(() => {
  const w = settings.data.weather
  if (w?.mode === 'city' && w?.lat != null && w?.lon != null) {
    setCity(w.cityName ?? '')
    fetchWeather(w.lat, w.lon)
    return
  }
  applyAutoLocation()
})

watch(
  () => settings.data.weather,
  (w) => {
    if (!w) {
      applyAutoLocation()
      return
    }
    if (w.mode === 'city') {
      applyCityLocation(w)
    } else {
      applyAutoLocation()
    }
  },
  { deep: true }
)
</script>

<template>
  <span v-if="loading" class="text-sm text-slate-400 dark-text-94">天气…</span>
  <span v-else-if="error" class="text-sm text-slate-400 dark-text-94" title="获取失败">天气 --</span>
  <span v-else class="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 dark-text-94">
    <span v-if="icon" class="material-symbols-outlined text-[18px]" aria-hidden="true">{{ icon }}</span>
    <span v-if="condition" class="text-slate-500 dark-text-94">{{ condition }}</span>
    <span>{{ tempText }}°C</span>
  </span>
</template>
