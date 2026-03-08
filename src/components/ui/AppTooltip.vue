<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 悬浮时显示的说明文案，为空则不显示 tooltip */
    content?: string | null
    /** 显示延迟（ms） */
    showDelay?: number
    /** 放置位置：above | below */
    placement?: 'above' | 'below'
  }>(),
  { content: '', showDelay: 200, placement: 'below' }
)

const visible = ref(false)
const position = ref({ left: 0, top: 0 })
const triggerRef = ref<HTMLElement | null>(null)
let showTimer: ReturnType<typeof setTimeout> | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null

const hasContent = () => !!props.content?.trim()

function clearTimers() {
  if (showTimer) {
    clearTimeout(showTimer)
    showTimer = null
  }
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
}

function updatePosition() {
  const el = triggerRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const gap = 8
  const tooltipHeight = 48 // 约估，实际由内容决定
  if (props.placement === 'above') {
    position.value = {
      left: rect.left + rect.width / 2,
      top: rect.top - gap,
    }
  } else {
    position.value = {
      left: rect.left + rect.width / 2,
      top: rect.bottom + gap,
    }
  }
}

function show() {
  if (!hasContent()) return
  clearTimers()
  hideTimer = null
  showTimer = setTimeout(() => {
    showTimer = null
    updatePosition()
    visible.value = true
  }, props.showDelay)
}

function hide() {
  clearTimers()
  showTimer = null
  hideTimer = setTimeout(() => {
    visible.value = false
    hideTimer = null
  }, 80)
}

function onScrollOrResize() {
  if (visible.value) {
    updatePosition()
  } else {
    visible.value = false
  }
}

onMounted(() => {
  window.addEventListener('scroll', onScrollOrResize, { capture: true })
  window.addEventListener('resize', onScrollOrResize)
})

onUnmounted(() => {
  clearTimers()
  window.removeEventListener('scroll', onScrollOrResize, { capture: true })
  window.removeEventListener('resize', onScrollOrResize)
})

watch(visible, (v) => {
  if (v) updatePosition()
})
</script>

<template>
  <span
    ref="triggerRef"
    class="app-tooltip-trigger inline-flex cursor-default"
    @mouseenter="show"
    @mouseleave="hide"
  >
    <slot />
    <Teleport to="body">
      <Transition name="tooltip-fade">
        <div
          v-show="visible && hasContent()"
          class="app-tooltip-panel fixed z-[200] max-w-[280px] px-3 py-2 text-sm leading-snug rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/95 shadow-xl text-slate-700 dark:text-slate-200 backdrop-blur-sm pointer-events-none whitespace-pre-wrap break-words"
          :style="{
            left: `${position.left}px`,
            top: `${position.top}px`,
            transform: placement === 'above' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
          }"
          role="tooltip"
        >
          {{ content }}
        </div>
      </Transition>
    </Teleport>
  </span>
</template>

<style scoped>
.tooltip-fade-enter-active,
.tooltip-fade-leave-active {
  transition: opacity 0.12s ease;
}
.tooltip-fade-enter-from,
.tooltip-fade-leave-to {
  opacity: 0;
}
</style>
