<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const display = ref('')

function update() {
  const now = new Date()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const weekday = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][now.getDay()]!
  const hh = String(now.getHours()).padStart(2, '0')
  const mi = String(now.getMinutes()).padStart(2, '0')
  display.value = `${mm}月${dd}日 ${weekday} ${hh}:${mi}`
}

let intervalId: ReturnType<typeof setInterval> | null = null
let timeoutId: ReturnType<typeof setTimeout> | null = null

function clearTimers() {
  if (timeoutId) { clearTimeout(timeoutId); timeoutId = null }
  if (intervalId) { clearInterval(intervalId); intervalId = null }
}

function scheduleMinuteTick() {
  clearTimers()
  const now = new Date()
  // 对齐到下一分钟开始，之后每分钟更新一次
  const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds()
  timeoutId = setTimeout(() => {
    update()
    intervalId = setInterval(update, 60_000)
  }, Math.max(250, msToNextMinute))
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') {
    update()
    scheduleMinuteTick()
  }
}

onMounted(() => {
  update()
  scheduleMinuteTick()
  document.addEventListener('visibilitychange', onVisibilityChange)
})
onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  clearTimers()
})
</script>

<template>
  <span class="text-sm font-bold tracking-tight text-slate-800 dark-text-94 tabular-nums" :title="display">
    {{ display }}
  </span>
</template>
