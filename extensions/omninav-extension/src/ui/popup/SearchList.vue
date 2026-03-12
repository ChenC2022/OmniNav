<script setup lang="ts">
import type { Bookmark } from '../../shared/types'

defineProps<{
  items: Bookmark[]
  catMap: Map<string, string>
}>()

const emit = defineEmits<{ open: [url: string] }>()
</script>

<template>
  <div class="list">
    <div v-if="items.length === 0" class="empty">没有匹配的书签</div>
    <div
      v-else
      v-for="b in items"
      :key="b.id"
      class="result-row"
      @click="emit('open', b.url)"
    >
      <div class="result-top">
        <div class="result-title">{{ b.title || b.url || '（无标题）' }}</div>
        <span v-if="b.categoryId && catMap.get(b.categoryId)" class="cat-badge">
          {{ catMap.get(b.categoryId) }}
        </span>
      </div>
      <div v-if="b.url" class="result-url">{{ b.url }}</div>
    </div>
  </div>
</template>

<style scoped>
.list {
  max-height: 200px;
  overflow-y: auto;
  border-radius: 10px;
  border: 1px solid var(--border, #e5e7eb);
  background: var(--bg, #fff);
  padding: 4px;
}
.empty {
  padding: 6px 4px;
  color: var(--text-faint, #9ca3af);
  font-size: 12px;
  text-align: center;
}
.result-row {
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.12s;
}
.result-row:hover {
  background: var(--result-hover, #f5f5f5);
}
.result-top {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.result-title {
  font-weight: 600;
  color: var(--text, #111827);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}
.cat-badge {
  flex-shrink: 0;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--cat-bg, #ede9fe);
  color: var(--cat-text, #6d28d9);
  font-size: 10px;
  font-weight: 500;
  white-space: nowrap;
}
.result-url {
  color: var(--url-text, #9ca3af);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
}
</style>
