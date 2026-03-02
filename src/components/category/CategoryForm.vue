<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Category } from '@/types'
import { nanoid } from '@/utils/id'
import { hashPassword } from '@/utils/crypto'

const props = defineProps<{
  modelValue: boolean
  edit?: Category | null
  order?: number
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'save', c: Category): void
}>()

const name = ref('')
const isPrivate = ref(false)
const passwordHint = ref('')
const password = ref('')
const submitting = ref(false)

watch(
  () => [props.modelValue, props.edit] as const,
  ([open, c]) => {
    if (open) {
      name.value = c?.name ?? ''
      isPrivate.value = c?.isPrivate ?? false
      passwordHint.value = c?.passwordHint ?? ''
      password.value = ''
    }
  },
  { immediate: true }
)

async function submit() {
  const n = name.value.trim()
  if (!n) return
  const id = props.edit?.id ?? nanoid()
  let passwordHash: string | undefined = props.edit?.passwordHash
  if (isPrivate.value) {
    const pwd = password.value.trim()
    if (pwd) {
      submitting.value = true
      try {
        passwordHash = await hashPassword(id, pwd)
      } finally {
        submitting.value = false
      }
    } else if (!props.edit?.passwordHash) {
      return
    }
  } else {
    passwordHash = undefined
  }
  emit('save', {
    id,
    name: n,
    order: props.edit?.order ?? props.order ?? 0,
    isPrivate: isPrivate.value || undefined,
    passwordHint: isPrivate.value ? (passwordHint.value.trim() || undefined) : undefined,
    passwordHash,
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
          class="w-full max-w-sm rounded-xl bg-white dark:bg-zinc-800 shadow-xl p-5 border border-zinc-200 dark:border-zinc-700"
          role="dialog"
          aria-label="添加或编辑分类"
        >
          <h3 class="text-lg font-medium text-zinc-800 dark:text-zinc-200 mb-4">
            {{ edit ? '编辑分类' : '新建分类' }}
          </h3>
          <form @submit.prevent="submit" class="space-y-3">
            <div>
              <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">名称</label>
              <input
                v-model="name"
                type="text"
                required
                class="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 px-3 py-2 text-sm"
                placeholder="如：开发、娱乐"
              />
            </div>
            <div class="flex items-center gap-2">
              <input
                id="cat-private"
                v-model="isPrivate"
                type="checkbox"
                class="rounded border-zinc-300 dark:border-zinc-600"
              />
              <label for="cat-private" class="text-sm text-zinc-700 dark:text-zinc-300">私密分类（需密码查看）</label>
            </div>
            <template v-if="isPrivate">
              <div>
                <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">密码提示（可选）</label>
                <input
                  v-model="passwordHint"
                  type="text"
                  class="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 px-3 py-2 text-sm"
                  placeholder="如：生日、纪念日"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  {{ edit?.passwordHash ? '新密码（留空则不修改）' : '密码' }}
                </label>
                <input
                  v-model="password"
                  type="password"
                  autocomplete="off"
                  class="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 px-3 py-2 text-sm"
                  :placeholder="edit?.passwordHash ? '留空保留原密码' : '设置查看密码'"
                />
              </div>
            </template>
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
                class="px-3 py-1.5 rounded-lg bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 font-medium disabled:opacity-50"
                :disabled="submitting || (isPrivate && !edit?.passwordHash && !password.trim())"
              >
                {{ submitting ? '保存中…' : '保存' }}
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
