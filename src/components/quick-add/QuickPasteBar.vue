<script setup lang="ts">
import { ref, computed } from 'vue'

const emit = defineEmits<{
  (e: 'submit', payload: { urls: string[]; deepAnalysis: boolean }): void
}>()

const inputValue = ref('')
const isFocused = ref(false)
const isExpanded = ref(false)
const deepAnalysis = ref(true)

/** 解析输入中的 URL（支持多行、逗号、空格分隔） */
const parsedUrls = computed(() => {
  const raw = inputValue.value.trim()
  if (!raw) return []
  // Split by newline, comma, or whitespace-following-url pattern
  const parts = raw.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)
  const urls: string[] = []
  for (const part of parts) {
    // Each part might contain multiple whitespace-separated URLs
    const segments = part.split(/\s+/).filter(Boolean)
    for (const seg of segments) {
      if (isValidUrlLike(seg)) {
        urls.push(normalizeUrl(seg))
      }
    }
  }
  return [...new Set(urls)] // deduplicate
})

const hasValidUrl = computed(() => parsedUrls.value.length > 0)

function isValidUrlLike(s: string): boolean {
  // Accept URLs with protocol or common domain patterns
  if (/^https?:\/\//i.test(s)) return true
  if (/^[a-zA-Z0-9]([a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}(\/\S*)?$/.test(s)) return true
  return false
}

function normalizeUrl(s: string): string {
  if (!/^https?:\/\//i.test(s)) return 'https://' + s
  return s
}

function handleSubmit() {
  if (!hasValidUrl.value) return
  emit('submit', { urls: parsedUrls.value, deepAnalysis: deepAnalysis.value })
  inputValue.value = ''
  isExpanded.value = false
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSubmit()
  }
}

function handlePaste() {
  // Let natural paste happen, then check if multi-line and expand
  setTimeout(() => {
    if (inputValue.value.includes('\n')) {
      isExpanded.value = true
    }
  }, 0)
}

function handleFocus() {
  isFocused.value = true
}

function handleBlur() {
  // Don't un-focus immediately so button clicks work
  setTimeout(() => {
    isFocused.value = false
  }, 200)
}

function clearInput() {
  inputValue.value = ''
  isExpanded.value = false
}
</script>

<template>
  <div class="quick-paste-bar w-full">
    <div
      class="quick-paste-container rounded-2xl border transition-all duration-300"
      :class="[
        isFocused || inputValue.trim()
          ? 'border-indigo-300 dark:border-indigo-500/40 shadow-lg shadow-indigo-500/10 dark:shadow-indigo-500/5'
          : 'border-slate-200/60 dark:border-white/10',
        'bg-white/60 dark:bg-white/[0.04] backdrop-blur-sm'
      ]"
    >
      <!-- Main input row -->
      <div class="flex items-center gap-2 px-3 py-2.5 sm:px-4 sm:py-3">
        <span
          class="material-symbols-outlined text-[20px] shrink-0 transition-colors duration-200"
          :class="isFocused || inputValue.trim()
            ? 'text-indigo-500 dark:text-indigo-400'
            : 'text-slate-400 dark:text-slate-500'"
        >
          add_link
        </span>

        <div class="flex-1 min-w-0">
          <textarea
            v-if="isExpanded"
            v-model="inputValue"
            class="quick-paste-input w-full bg-transparent border-none outline-none text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 resize-none custom-scrollbar"
            :rows="3"
            placeholder="粘贴多个 URL（每行一个）…"
            @keydown="handleKeydown"
            @focus="handleFocus"
            @blur="handleBlur"
          />
          <input
            v-else
            v-model="inputValue"
            type="text"
            class="quick-paste-input w-full bg-transparent border-none outline-none text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            placeholder="快速添加：粘贴网址，AI 自动归类入库"
            @keydown="handleKeydown"
            @paste="handlePaste"
            @focus="handleFocus"
            @blur="handleBlur"
          >
        </div>

        <!-- URL count badge -->
        <Transition name="menu-pop">
          <span
            v-if="parsedUrls.length > 0"
            class="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300"
          >
            {{ parsedUrls.length }} 个链接
          </span>
        </Transition>

        <!-- Expand toggle (multi-line) -->
        <button
          v-if="!isExpanded && inputValue.trim()"
          type="button"
          class="shrink-0 p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100/60 dark:hover:bg-white/5 transition-colors"
          title="多行模式"
          @click="isExpanded = true"
        >
          <span class="material-symbols-outlined text-[18px]">unfold_more</span>
        </button>

        <!-- Collapse toggle -->
        <button
          v-if="isExpanded"
          type="button"
          class="shrink-0 p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100/60 dark:hover:bg-white/5 transition-colors"
          title="单行模式"
          @click="isExpanded = false"
        >
          <span class="material-symbols-outlined text-[18px]">unfold_less</span>
        </button>

        <!-- Clear button -->
        <button
          v-if="inputValue.trim()"
          type="button"
          class="shrink-0 p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
          title="清空"
          @click="clearInput"
        >
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>

        <!-- Submit button -->
        <button
          type="button"
          class="shrink-0 h-8 px-3 sm:px-4 rounded-xl text-sm font-semibold flex items-center gap-1.5 transition-all duration-200"
          :class="hasValidUrl
            ? 'bg-indigo-500 dark:bg-indigo-400 text-white hover:bg-indigo-600 dark:hover:bg-indigo-300 active:scale-[0.97] cursor-pointer shadow-sm'
            : 'bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-slate-600 cursor-not-allowed'"
          :disabled="!hasValidUrl"
          @click="handleSubmit"
        >
          <span class="material-symbols-outlined text-[18px]">auto_awesome</span>
          <span class="hidden sm:inline">AI 归类</span>
        </button>
      </div>

      <!-- Options row (visible when has input) -->
      <Transition name="menu-pop">
        <div
          v-if="parsedUrls.length > 0"
          class="flex items-center gap-4 px-3 sm:px-4 pb-2.5 pt-0"
        >
          <label class="flex items-center gap-2 cursor-pointer select-none group">
            <span
              class="relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors duration-200 ease-in-out"
              :class="deepAnalysis
                ? 'bg-indigo-500 dark:bg-indigo-400'
                : 'bg-slate-300 dark:bg-slate-600'"
            >
              <input
                v-model="deepAnalysis"
                type="checkbox"
                class="sr-only"
              >
              <span
                class="pointer-events-none inline-block size-3 rounded-full bg-white transition-transform duration-200 ease-in-out mt-[2px] ml-[2px]"
                :class="deepAnalysis ? 'translate-x-[11px]' : 'translate-x-0'"
              />
            </span>
            <span class="text-xs text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300 transition-colors">
              深度分析（抓取网页摘要，更精准）
            </span>
          </label>
          <span class="text-xs text-slate-400 dark:text-slate-600 hidden sm:inline">
            Enter 快速提交 · Shift+Enter 换行
          </span>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.quick-paste-input:focus {
  outline: none;
  box-shadow: none;
}

/* Smooth expand/collapse */
.quick-paste-container {
  will-change: box-shadow, border-color;
}
</style>
