<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const time = ref('')
const date = ref('')

function update() {
  const now = new Date()
  time.value = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  date.value = now.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' })
}

let tid: ReturnType<typeof setInterval>
onMounted(() => {
  update()
  tid = setInterval(update, 1000)
})
onUnmounted(() => clearInterval(tid))
</script>

<template>
  <span class="text-sm font-bold tracking-tight text-slate-800 dark-text-94 tabular-nums" :title="date">
    {{ time }}
  </span>
</template>
