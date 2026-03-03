<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Bookmark } from '@/types'
import { useHealthCheckStore } from '@/stores/healthCheck'
import { faviconUrl, faviconFallbackUrl } from '@/utils/favicon'

const props = withDefaults(
  defineProps<{
    bookmark: Bookmark
    showTitle?: boolean
    size?: 'sm' | 'md' | 'lg'
    /** 为 true 时禁用链接默认拖拽，便于父级列表项参与 sortable 拖拽（如编辑布局下分类内书签） */
    notDraggable?: boolean
  }>(),
  { notDraggable: false }
)

defineEmits<{
  (e: 'edit'): void
  (e: 'delete'): void
  (e: 'togglePin'): void
}>()

const healthCheckStore = useHealthCheckStore()
const iconStage = ref<'proxy' | 'fallback' | 'letter'>('proxy')

const iconSize = computed(() => {
  const s = props.size ?? 'md'
  return s === 'lg' ? 40 : s === 'sm' ? 20 : 28
})

const healthClass = computed(() => {
  const h = props.bookmark.health
  if (h === 'error') return 'opacity-50 grayscale'
  if (h === 'warn') return 'opacity-75'
  return ''
})

/** 当前是否正在检测此书签 */
const isChecking = computed(() => healthCheckStore.currentCheckingBookmarkId === props.bookmark.id)

/** 标题后方状态小圆点样式（低调）；检测中时显示中性色并闪烁 */
const healthDotClass = computed(() => {
  if (isChecking.value) return 'bg-slate-400/80 dark:bg-slate-400/80'
  const h = props.bookmark.health
  if (h === 'error') return 'bg-slate-400/70 dark:bg-slate-500/70'
  if (h === 'warn') return 'bg-amber-400/60 dark:bg-amber-500/60'
  if (h === 'ok') return 'bg-emerald-400/50 dark:bg-emerald-500/50'
  return ''
})

/** 是否显示状态点：已有 health 或正在检测 */
const showHealthDot = computed(() => props.bookmark.health != null || isChecking.value)

const currentSrc = computed(() => {
  if (iconStage.value === 'proxy') return faviconUrl(props.bookmark.url, iconSize.value)
  if (iconStage.value === 'fallback') return faviconFallbackUrl(props.bookmark.url)
  return ''
})

const fallbackLetter = computed(() => {
  const t = props.bookmark.title?.trim()
  if (t) return t.charAt(0).toUpperCase()
  return '?'
})

function onIconError() {
  if (iconStage.value === 'proxy') {
    const fb = faviconFallbackUrl(props.bookmark.url)
    if (fb) {
      iconStage.value = 'fallback'
      return
    }
  }
  iconStage.value = 'letter'
}
</script>

<template>
  <a
    :href="bookmark.url"
    target="_blank"
    rel="noopener noreferrer"
    :draggable="!notDraggable"
    class="flex flex-col items-center gap-2 rounded-xl p-3 min-w-[4rem] hover:bg-slate-200/5 dark:hover:bg-white/5 transition-colors duration-200 group text-slate-600 dark:text-white cursor-pointer"
    :title="bookmark.description || bookmark.title"
  >
    <img
      v-if="iconStage !== 'letter'"
      :src="currentSrc"
      :alt="''"
      :width="iconSize"
      :height="iconSize"
      class="rounded-lg flex-shrink-0 transition-all object-contain"
      :class="healthClass"
      @error="onIconError"
    />
    <div
      v-else
      class="rounded-lg flex-shrink-0 flex items-center justify-center bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-bold transition-all"
      :class="healthClass"
      :style="{ width: `${iconSize}px`, height: `${iconSize}px`, fontSize: iconSize * 0.5 + 'px' }"
    >
      {{ fallbackLetter }}
    </div>
    <span
      v-if="showTitle !== false"
      class="inline-flex items-center gap-1.5 max-w-full"
      :class="size === 'sm' ? 'min-w-0 text-left' : 'justify-center max-w-[6rem]'"
    >
      <span class="text-xs font-semibold truncate min-w-0">{{ bookmark.title }}</span>
      <span
        v-if="showHealthDot"
        class="shrink-0 w-1.5 h-1.5 rounded-full"
        :class="[healthDotClass, isChecking && 'health-dot-checking']"
        :title="isChecking ? '检测中…' : (bookmark.health === 'ok' ? '链接正常' : bookmark.health === 'warn' ? '链接异常' : '链接失效')"
        aria-hidden
      />
    </span>
  </a>
</template>
