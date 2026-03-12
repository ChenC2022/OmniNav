<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Category } from '../../shared/types'

const props = defineProps<{
  title: string
  url: string
  categories: Category[]
  suggestedCategoryId: string | null
  isClassifying: boolean
}>()

const emit = defineEmits<{
  save: [payload: { title: string; categoryId: string | null }]
  cancel: []
}>()

const editTitle = ref(props.title)
const selectedCategoryId = ref<string>(props.suggestedCategoryId ?? '')

watch(() => props.suggestedCategoryId, (val) => {
  selectedCategoryId.value = val ?? ''
})
watch(() => props.title, (val) => {
  editTitle.value = val
})

function onSave() {
  emit('save', {
    title: editTitle.value.trim() || props.title,
    categoryId: selectedCategoryId.value || null,
  })
}
</script>

<template>
  <div class="card">
    <div class="card-header">
      <span>🤖</span>
      <span>{{ isClassifying ? 'AI 分类中…' : 'AI 分类建议 · 可修改后保存' }}</span>
    </div>

    <div class="fields">
      <div class="field">
        <label class="field-label">标题</label>
        <input v-model="editTitle" class="input" :disabled="isClassifying" />
      </div>
      <div class="field">
        <label class="field-label">分类</label>
        <select v-model="selectedCategoryId" class="input" :disabled="isClassifying">
          <option value="">未分类</option>
          <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </div>
      <div class="url-preview" :title="url">{{ url }}</div>
      <div class="actions">
        <button class="btn btn-outline" :disabled="isClassifying" @click="emit('cancel')">取消</button>
        <button class="btn btn-primary" :disabled="isClassifying" @click="onSave">
          {{ isClassifying ? '分类中…' : '保存' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.card {
  margin-bottom: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--card-border, #e0e7ff);
  background: var(--card-bg, #f5f3ff);
}
.card-header {
  font-size: 11px;
  color: var(--card-label, #7c3aed);
  font-weight: 600;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 5px;
}
.fields {
  display: grid;
  gap: 7px;
}
.field {
  display: grid;
  gap: 3px;
}
.field-label {
  font-size: 11px;
  color: var(--text-faint, #9ca3af);
}
.input {
  width: 100%;
  padding: 5px 8px;
  border-radius: 7px;
  border: 1px solid var(--input-border, #d1d5db);
  font-size: 12px;
  outline: none;
  background: var(--input-bg, #fafafa);
  color: var(--text, #111827);
  box-sizing: border-box;
  font-family: inherit;
}
.input:focus {
  border-color: #6366f1;
}
.input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.url-preview {
  font-size: 11px;
  color: var(--url-text, #9ca3af);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
  margin-top: 2px;
}
.btn {
  padding: 5px 12px;
  border-radius: 7px;
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s;
}
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-outline {
  border: 1px solid var(--border, #d1d5db);
  background: var(--bg, white);
  color: var(--text-muted, #6b7280);
}
.btn-outline:hover:not(:disabled) { background: var(--bg-muted, #f3f4f6); }
.btn-primary {
  border: none;
  background: #4f46e5;
  color: white;
  font-weight: 600;
}
.btn-primary:hover:not(:disabled) { background: #4338ca; }
</style>
