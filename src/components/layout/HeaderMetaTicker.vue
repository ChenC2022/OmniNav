<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useSettingsStore } from '@/stores/settings'

const settings = useSettingsStore()

const cityName = ref('')
const timeText = ref('')
const dateWeekText = ref('')
const temp = ref<number | null>(null)
const condition = ref('')
const icon = ref('')
const loading = ref(true)
const error = ref(false)
const tickerIndex = ref(0)

const weatherText = computed(() => {
  if (loading.value) return '天气…'
  if (error.value) return '天气 --'
  const tempText = temp.value == null ? '--' : `${temp.value.toFixed(1)}°C`
  return condition.value ? `${condition.value} ${tempText}` : tempText
})

const secondaryItems = computed(() => [dateWeekText.value, weatherText.value])
const secondaryText = computed(() => secondaryItems.value[tickerIndex.value % secondaryItems.value.length] ?? '')
const showingWeather = computed(() => (tickerIndex.value % secondaryItems.value.length) === 1)

let minuteIntervalId: ReturnType<typeof setInterval> | null = null
let minuteTimeoutId: ReturnType<typeof setTimeout> | null = null
let tickerIntervalId: ReturnType<typeof setInterval> | null = null

function updateClock() {
  const now = new Date()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const weekday = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][now.getDay()]!
  const hh = String(now.getHours()).padStart(2, '0')
  const mi = String(now.getMinutes()).padStart(2, '0')
  timeText.value = `${hh}:${mi}`
  dateWeekText.value = `${mm}月${dd}日 ${weekday}`
}

function clearClockTimers() {
  if (minuteTimeoutId) {
    clearTimeout(minuteTimeoutId)
    minuteTimeoutId = null
  }
  if (minuteIntervalId) {
    clearInterval(minuteIntervalId)
    minuteIntervalId = null
  }
}

function scheduleMinuteTick() {
  clearClockTimers()
  const now = new Date()
  const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds()
  minuteTimeoutId = setTimeout(() => {
    updateClock()
    minuteIntervalId = setInterval(updateClock, 60_000)
  }, Math.max(250, msToNextMinute))
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
  cityName.value = ''
  if (!navigator.geolocation?.getCurrentPosition) {
    await fetchWeather(39.9, 116.4)
    if (settings.data.weather?.mode === 'city') return
    cityName.value = '北京'
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
        cityName.value = j.ok && j.cityName ? j.cityName : '当前定位'
      } catch {
        cityName.value = '当前定位'
      }
    },
    async () => {
      if (settings.data.weather?.mode === 'city') return
      await fetchWeather(39.9, 116.4)
      if (settings.data.weather?.mode === 'city') return
      cityName.value = '北京'
    }
  )
}

function applyCityLocation(w: NonNullable<typeof settings.data.weather>) {
  const lat = w.lat
  const lon = w.lon
  if (lat != null && lon != null && !Number.isNaN(lat) && !Number.isNaN(lon)) {
    cityName.value = w.cityName ?? ''
    fetchWeather(lat, lon)
    return
  }
  applyAutoLocation()
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') {
    updateClock()
    scheduleMinuteTick()
  }
}

onMounted(() => {
  updateClock()
  scheduleMinuteTick()
  document.addEventListener('visibilitychange', onVisibilityChange)

  const w = settings.data.weather
  if (w?.mode === 'city' && w?.lat != null && w?.lon != null) {
    cityName.value = w.cityName ?? ''
    fetchWeather(w.lat, w.lon)
  } else {
    applyAutoLocation()
  }

  tickerIntervalId = setInterval(() => {
    tickerIndex.value = (tickerIndex.value + 1) % secondaryItems.value.length
  }, 8000)
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  clearClockTimers()
  if (tickerIntervalId) clearInterval(tickerIntervalId)
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
  <!-- 固定占位宽度，避免轮播文本长短导致 header 抖动、影响搜索栏宽度 -->
  <div class="inline-flex items-center gap-2 w-[14rem] min-w-[14rem] text-slate-700 dark-text-94">
    <span v-if="cityName" class="text-sm font-medium truncate max-w-[4.5rem]" :title="cityName">{{ cityName }}</span>
    <span class="text-sm font-bold tabular-nums shrink-0" :title="timeText">{{ timeText }}</span>
    <span class="text-slate-400 dark:text-slate-500 shrink-0">·</span>
    <span class="inline-flex items-center gap-1 w-[8.5rem] min-w-0 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
      <span
        v-if="showingWeather && icon && !loading && !error"
        class="material-symbols-outlined text-[16px] shrink-0"
        aria-hidden="true"
      >
        {{ icon }}
      </span>
      <span class="truncate" :title="secondaryText">{{ secondaryText }}</span>
    </span>
  </div>
</template>
