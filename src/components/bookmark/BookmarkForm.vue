<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Bookmark } from '@/types'
import { nanoid } from '@/utils/id'
import { apiFetch } from '@/utils/api'
import { useCategoriesStore } from '@/stores/categories'

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
const generatingInfo = ref(false)
const generateInfoError = ref('')

const categoriesStore = useCategoriesStore()
const selectedCategoryId = ref('')

watch(
  () => [props.modelValue, props.edit] as const,
  ([open, b]) => {
    if (open) {
      generateInfoError.value = ''
      if (b) {
        title.value = b.title
        url.value = b.url
        description.value = b.description ?? ''
        selectedCategoryId.value = b.categoryId
      } else {
        title.value = ''
        url.value = ''
        description.value = ''
        selectedCategoryId.value = props.categoryId
      }
    }
  },
  { immediate: true }
)

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
    
    const prompt = `URL: ${u}。
页面标题: ${metaData.title || ''}
页面描述: ${metaData.description || ''}
页面摘录: ${metaData.snippet || ''}

${catList}
请根据以上信息为该书签建议一个更准确、简洁的标题（如站点名、产品名，2~15字）和一句简短描述（1~2句话，介绍内容或用途）。
${existingCategories.length > 0 ? '同时请从上述分类列表中选择一个最合适的分类归属。' : ''}
请仅输出 JSON 格式，不要包含任何 Markdown 代码块或多余文字。格式示例：
{"title": "建议的标题", "description": "建议的描述"${existingCategories.length > 0 ? ', "category": "分类名"' : ''}}`

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
            </div>
            <div>
              <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">所属分类</label>
              <select
                v-model="selectedCategoryId"
                class="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white/50 dark:bg-white/5 text-slate-900 dark:text-slate-100 px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all"
              >
                <option v-for="cat in categoriesStore.items" :key="cat.id" :value="cat.id">
                  {{ cat.name }}
                </option>
              </select>
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
</style>
