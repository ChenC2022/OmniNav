<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Bookmark } from '@/types'
import { nanoid } from '@/utils/id'

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

watch(
  () => [props.modelValue, props.edit] as const,
  ([open, b]) => {
    if (open) {
      if (b) {
        title.value = b.title
        url.value = b.url
        description.value = b.description ?? ''
      } else {
        title.value = ''
        url.value = ''
        description.value = ''
      }
    }
  },
  { immediate: true }
)

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
    categoryId: props.edit?.categoryId ?? props.categoryId,
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
          class="w-full max-w-md rounded-xl bg-white dark:bg-zinc-800 shadow-xl p-5 border border-zinc-200 dark:border-zinc-700"
          role="dialog"
          aria-label="添加或编辑书签"
        >
          <h3 class="text-lg font-medium text-zinc-800 dark:text-zinc-200 mb-4">
            {{ edit ? '编辑书签' : '添加书签' }}
          </h3>
          <form @submit.prevent="submit" class="space-y-3">
            <div>
              <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">标题（可选）</label>
              <input
                v-model="title"
                type="text"
                class="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 px-3 py-2 text-sm"
                placeholder="不填则使用网址域名"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">URL</label>
              <input
                v-model="url"
                type="url"
                required
                class="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 px-3 py-2 text-sm"
                placeholder="https://..."
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">描述（可选）</label>
              <input
                v-model="description"
                type="text"
                class="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 px-3 py-2 text-sm"
                placeholder="简要说明"
              />
            </div>
            <div class="flex justify-end gap-2 pt-2">
              <button
                type="button"
                class="px-3 py-1.5 rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/5 dark:hover:bg-white/5"
                @click="close"
              >
                取消
              </button>
              <button
                type="submit"
                class="px-3 py-1.5 rounded-lg bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 font-medium"
              >
                保存
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
