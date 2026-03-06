<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const props = defineProps<{
  targetSelector?: string
  triggerSelector?: string
  threshold?: number
}>()

const show = ref(false)
const scrollContainer = ref<HTMLElement | null>(null)
const triggerElement = ref<HTMLElement | null>(null)

// 路由切换时重置触发元素（因为 DOM 可能会改变）
watch(() => route.path, () => {
  triggerElement.value = null
  show.value = false
})

function handleScroll() {
  if (!scrollContainer.value) return
  
  // 如果有选择器但还没找到元素（比如路由切换后重新渲染），尝试重新查找
  if (props.triggerSelector && !triggerElement.value) {
    const el = document.querySelector(props.triggerSelector)
    if (el instanceof HTMLElement) triggerElement.value = el
  }
  
  let currentThreshold = props.threshold ?? 300
  
  if (triggerElement.value) {
    // 动态计算阈值：触发元素的底部位置 (相对于滚动容器)
    currentThreshold = triggerElement.value.offsetTop + triggerElement.value.offsetHeight
  }
  
  show.value = scrollContainer.value.scrollTop > currentThreshold
}

function scrollToTop() {
  scrollContainer.value?.scrollTo({
    top: 0,
    behavior: 'smooth'
  })
}

onMounted(() => {
  const scrollEl = props.targetSelector 
    ? document.querySelector(props.targetSelector) 
    : document.querySelector('.main')
  
  if (scrollEl instanceof HTMLElement) {
    scrollContainer.value = scrollEl
    scrollEl.addEventListener('scroll', handleScroll, { passive: true })
  }

  // 查找触发阈值的元素
  if (props.triggerSelector) {
    const triggerEl = document.querySelector(props.triggerSelector)
    if (triggerEl instanceof HTMLElement) {
      triggerElement.value = triggerEl
      // 初次计算
      handleScroll()
    }
  }
})

onUnmounted(() => {
  scrollContainer.value?.removeEventListener('scroll', handleScroll)
})
</script>

<template>
  <Transition name="fade-scale">
    <button
      v-if="show"
      type="button"
      class="back-to-top-btn fixed bottom-8 right-8 z-40 size-11 md:size-12 rounded-xl flex items-center justify-center glass-translucent border border-slate-200/60 dark:border-white/20 text-slate-600 dark:text-white/80 hover:bg-slate-200/50 dark:hover:bg-white/10 shadow-lg transition-all cursor-pointer select-none"
      aria-label="回到顶部"
      @click="scrollToTop"
    >
      <span class="material-symbols-outlined text-[24px] md:text-[28px]">arrow_upward</span>
    </button>
  </Transition>
</template>

<style scoped>
.back-to-top-btn {
  /* 基础样式已通过 Tailwind class 实现，此处仅保留微调与动画 */
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.back-to-top-btn:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 24px -8px rgba(0, 0, 0, 0.15);
}

:global(.dark) .back-to-top-btn:hover {
  box-shadow: 0 12px 24px -8px rgba(0, 0, 0, 0.4);
}

.back-to-top-btn:active {
  transform: translateY(-2px) scale(0.95);
}

.fade-scale-enter-active,
.fade-scale-leave-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.fade-scale-enter-from,
.fade-scale-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.8);
}
</style>
