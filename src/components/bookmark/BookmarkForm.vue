<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { onClickOutside } from '@vueuse/core'
import type { Bookmark } from '@/types'
import { nanoid } from '@/utils/id'
import { apiFetch } from '@/utils/api'
import { useCategoriesStore } from '@/stores/categories'
import { buildBookmarkSuggestionPrompt } from '@/constants/prompts'
import { faviconUrl, faviconFallbackUrl } from '@/utils/favicon'

const props = defineProps<{
  modelValue: boolean
  categoryId: string
  edit?: Bookmark | null
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'save', b: Bookmark): void
}>()

const title = ref('')
const url = ref('')
const description = ref('')
const favicon = ref('')
const generatingInfo = ref(false)
const generateInfoError = ref('')
/** 图标预览：刷新时递增，用于 cache-bust 强制重新请求 */
const iconPreviewRefreshKey = ref(0)
/** 图标展示阶段：proxy -> fallback -> letter */
const iconStage = ref<'proxy' | 'fallback' | 'letter'>('proxy')
/** 自定义图标地址预览加载失败时置为 true */
const customPreviewError = ref(false)

const categoriesStore = useCategoriesStore()
const selectedCategoryId = ref('')
const categoryDropdownOpen = ref(false)
const categoryDropdownRef = ref<HTMLElement | null>(null)
onClickOutside(categoryDropdownRef, () => { categoryDropdownOpen.value = false })
const selectedCategoryName = computed(() =>
  categoriesStore.items.find(c => c.id === selectedCategoryId.value)?.name ?? ''
)
function selectCategory(id: string) {
  selectedCategoryId.value = id
  categoryDropdownOpen.value = false
}

watch(
  () => [props.modelValue, props.edit] as const,
  ([open, b]) => {
    if (open) {
      generateInfoError.value = ''
      iconStage.value = 'proxy'
      iconPreviewRefreshKey.value = 0
      customPreviewError.value = false
      if (b) {
        title.value = b.title
        url.value = b.url
        description.value = b.description ?? ''
        selectedCategoryId.value = b.categoryId
        favicon.value = b.favicon ?? ''
      } else {
        title.value = ''
        url.value = ''
        description.value = ''
        selectedCategoryId.value = props.categoryId
        favicon.value = ''
      }
    }
  },
  { immediate: true }
)
watch(url, () => {
  iconStage.value = 'proxy'
})

async function generateInfoByAI() {
  const u = url.value.trim()
  if (!u) return
  generatingInfo.value = true
  generateInfoError.value = ''
  try {
    const metaRes = await apiFetch('/api/extract-meta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: u }),
    })
    const metaData = await metaRes.json().catch(() => ({}))
    
    const existingCategories = categoriesStore.items.map(c => c.name)
    const catList = existingCategories.length > 0 ? `现有分类列表: ${existingCategories.join(', ')}。` : ''
    const prompt = buildBookmarkSuggestionPrompt({
      url: u,
      title: metaData.title || '',
      description: metaData.description || '',
      snippet: metaData.snippet || '',
      catList,
      withCategory: existingCategories.length > 0,
    })

    const aiRes = await apiFetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }]
      })
    })
    const aiData = await aiRes.json().catch(() => ({}))
    
    if (!aiRes.ok) {
        const code = (aiData as { code?: string })?.code
        generateInfoError.value = code === 'AI_NOT_CONFIGURED' ? 'AI 未配置，请先到设置页填写' : (aiData as { error?: string })?.error ?? '分析失败'
        return
    }

    let text = (aiData as { message?: string })?.message ?? ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) text = jsonMatch[0]
    
    const parsed = JSON.parse(text)
    if (parsed.title) title.value = parsed.title
    if (parsed.description) description.value = parsed.description
    
    if (parsed.category) {
      const matched = categoriesStore.items.find(c => c.name === parsed.category)
      if (matched) {
        selectedCategoryId.value = matched.id
      }
    }
  } catch (err) {
    generateInfoError.value = 'AI 分析失败'
  } finally {
    generatingInfo.value = false
  }
}

function titleFromUrl(urlStr: string): string {
  try {
    const u = new URL(urlStr.startsWith('http') ? urlStr : `https://${urlStr}`)
    return u.hostname.replace(/^www\./, '') || urlStr
  } catch {
    return urlStr
  }
}

const iconPreviewSize = 32
/** “图标地址” 填了且为 http(s) 时视为自定义图标 */
const hasCustomFaviconInForm = computed(() => {
  const u = favicon.value.trim()
  return !!(u && (u.startsWith('http://') || u.startsWith('https://')))
})
const iconPreviewSrc = computed(() => {
  const u = url.value.trim()
  if (!u) return ''
  if (iconStage.value === 'proxy') {
    return `${faviconUrl(u, iconPreviewSize)}&_t=${iconPreviewRefreshKey.value}`
  }
  if (iconStage.value === 'fallback') return faviconFallbackUrl(u) ?? ''
  return ''
})
/** 预览区实际显示的 src：有自定义图标时优先用自定义，否则用自动获取 */
const effectivePreviewSrc = computed(() => {
  if (hasCustomFaviconInForm.value) return favicon.value.trim()
  return iconPreviewSrc.value
})
const iconFallbackLetter = computed(() => {
  const t = title.value.trim() || titleFromUrl(url.value.trim())
  return t ? t.charAt(0).toUpperCase() : '?'
})
function onPreviewIconError() {
  if (hasCustomFaviconInForm.value) {
    customPreviewError.value = true
    return
  }
  if (iconStage.value === 'proxy' && faviconFallbackUrl(url.value.trim())) {
    iconStage.value = 'fallback'
    return
  }
  iconStage.value = 'letter'
}
watch(favicon, () => { customPreviewError.value = false })
function refreshIcon() {
  if (!url.value.trim()) return
  customPreviewError.value = false
  iconStage.value = 'proxy'
  iconPreviewRefreshKey.value += 1
}
/** 预览区是否显示首字母（无图或自定义图加载失败） */
const showPreviewLetter = computed(() => {
  if (!effectivePreviewSrc.value) return true
  if (hasCustomFaviconInForm.value && customPreviewError.value) return true
  return iconStage.value === 'letter'
})

function submit() {
  const t = title.value.trim()
  const u = url.value.trim()
  if (!u) return
  const displayTitle = t || titleFromUrl(u)
  emit('save', {
    id: props.edit?.id ?? nanoid(),
    title: displayTitle,
    url: u,
    description: description.value.trim() || undefined,
    categoryId: selectedCategoryId.value,
    order: props.edit?.order ?? 0,
    favicon: favicon.value.trim() || undefined,
    ...(props.edit ? {} : { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }),
  })
  emit('update:modelValue', false)
}

function close() {
  emit('update:modelValue', false)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="modelValue"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
        @click.self="close"
      >
        <div
          class="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-2xl p-6 border border-slate-200/60 dark:border-white/10"
          role="dialog"
          aria-label="添加或编辑书签"
        >
          <h3 class="text-xl font-bold text-slate-800 dark:text-white mb-6">
            {{ edit ? '编辑书签' : '添加书签' }}
          </h3>
          <form @submit.prevent="submit" class="space-y-5">
            <div>
              <div class="flex items-center justify-between gap-2 mb-1.5">
                <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300">URL</label>
                <button
                  type="button"
                  class="text-xs px-2 py-1 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 disabled:opacity-50 flex items-center gap-1"
                  :disabled="generatingInfo || !url.trim()"
                  @click="generateInfoByAI"
                >
                  <span class="material-symbols-outlined text-sm">{{ generatingInfo ? 'progress_activity' : 'auto_awesome' }}</span>
                  {{ generatingInfo ? '生成中…' : 'AI 生成标题与描述' }}
                </button>
              </div>
              <input
                v-model="url"
                type="url"
                required
                class="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white/50 dark:bg-white/5 text-slate-900 dark:text-slate-100 px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all"
                placeholder="https://..."
              />
              <p v-if="generateInfoError" class="mt-1 text-xs text-red-500 dark:text-red-400">{{ generateInfoError }}</p>
              <!-- 书签图标预览：有“图标地址”时显示自定义图标，否则显示自动获取 -->
              <div v-if="url.trim()" class="mt-2 flex items-center gap-3">
                <div class="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 shrink-0 overflow-hidden">
                  <img
                    v-if="effectivePreviewSrc && !showPreviewLetter"
                    :src="effectivePreviewSrc"
                    :alt="''"
                    width="32"
                    height="32"
                    class="w-8 h-8 object-contain"
                    @error="onPreviewIconError"
                  />
                  <span
                    v-else
                    class="bookmark-letter w-full h-full flex items-center justify-center text-sm font-bold text-slate-500 dark:text-slate-400"
                  >
                    {{ iconFallbackLetter }}
                  </span>
                </div>
                <button
                  type="button"
                  class="text-xs px-2 py-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 flex items-center gap-1 transition-colors"
                  @click="refreshIcon"
                >
                  <span class="material-symbols-outlined text-sm">refresh</span>
                  刷新图标
                </button>
              </div>
            </div>
            <div>
              <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">所属分类</label>
              <div ref="categoryDropdownRef" class="relative">
                <button
                  type="button"
                  class="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white/50 dark:bg-white/5 text-slate-900 dark:text-slate-100 px-3 py-2.5 text-sm text-left flex items-center justify-between gap-2 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all hover:border-slate-300 dark:hover:border-white/20"
                  :aria-expanded="categoryDropdownOpen"
                  aria-haspopup="listbox"
                  aria-label="选择所属分类"
                  @click="categoryDropdownOpen = !categoryDropdownOpen"
                >
                  <span class="truncate">{{ selectedCategoryName || '请选择' }}</span>
                  <span class="material-symbols-outlined text-lg shrink-0 text-slate-500 dark:text-slate-400" :class="categoryDropdownOpen ? 'rotate-180' : ''">expand_more</span>
                </button>
                <Transition name="dropdown">
                  <ul
                    v-show="categoryDropdownOpen"
                    class="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 shadow-lg py-1 custom-scrollbar"
                    role="listbox"
                  >
                    <li
                      v-for="cat in categoriesStore.items"
                      :key="cat.id"
                      role="option"
                      :aria-selected="selectedCategoryId === cat.id"
                      class="px-3 py-2.5 text-sm cursor-pointer text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/80 focus:bg-slate-100 dark:focus:bg-slate-700/80 focus:outline-none"
                      :class="selectedCategoryId === cat.id ? 'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-200' : ''"
                      @click="selectCategory(cat.id)"
                    >
                      {{ cat.name }}
                    </li>
                  </ul>
                </Transition>
              </div>
            </div>
            <div>
              <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">标题（可选）</label>
              <input
                v-model="title"
                type="text"
                class="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white/50 dark:bg-white/5 text-slate-900 dark:text-slate-100 px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all"
                placeholder="不填则使用网址域名"
              />
            </div>
            <div>
              <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">描述（可选）</label>
              <textarea
                v-model="description"
                rows="3"
                class="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white/50 dark:bg-white/5 text-slate-900 dark:text-slate-100 px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all resize-none"
                placeholder="简要说明该书签的内容..."
              />
            </div>
            <div>
              <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">图标地址（可选）</label>
              <input
                v-model="favicon"
                type="url"
                class="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white/50 dark:bg-white/5 text-slate-900 dark:text-slate-100 px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all"
                placeholder="自动获取失败时可填图片 URL，如 https://..."
              />
              <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">部分站点（如受 Cloudflare 保护）无法自动拉取图标，可在此粘贴图标图片链接</p>
            </div>
            <div class="flex justify-end gap-2 pt-2">
              <button
                type="button"
                class="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                @click="close"
              >
                取消
              </button>
              <button
                type="submit"
                class="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 dark:bg-indigo-400 dark:hover:bg-indigo-300 text-white font-semibold shadow-sm transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center min-w-[80px]"
                :disabled="generatingInfo"
              >
                <span v-if="generatingInfo" class="material-symbols-outlined text-[18px] animate-spin mr-1.5">progress_activity</span>
                {{ generatingInfo ? '稍后...' : '保存' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
