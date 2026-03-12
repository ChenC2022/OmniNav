<script setup lang="ts">
import type { Bookmark } from '../../shared/types'

defineProps<{ pinnedBookmarks: Bookmark[] }>()

const emit = defineEmits<{ open: [url: string] }>()

function faviconUrl(b: Bookmark): string {
  if (b.favicon) return b.favicon
  try {
    const origin = new URL(b.url).origin
    return `https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(origin)}`
  } catch {
    return ''
  }
}
</script>

<template>
  <div class="pinned-section">
    <div class="pinned-label">置顶书签</div>
    <div class="pinned-grid">
      <div
        v-for="b in pinnedBookmarks"
        :key="b.id"
        class="pinned-item"
        :title="b.title || b.url"
        @click="emit('open', b.url)"
      >
        <div class="favicon-wrap">
          <img
            v-if="faviconUrl(b)"
            :src="faviconUrl(b)"
            width="20"
            height="20"
            class="favicon-img"
            @error="(e) => ((e.target as HTMLImageElement).style.display = 'none')"
          />
          <span v-else class="favicon-fallback">🔖</span>
        </div>
        <div class="pinned-name">{{ b.title || b.url || '（无标题）' }}</div>
      </div>
    </div>
  </div>
  <div class="divider" />
</template>

<style scoped>
.pinned-section {
  padding: 8px 6px 4px;
}
.pinned-label {
  font-size: 11px;
  color: var(--pinned-label, #9ca3af);
  font-weight: 600;
  letter-spacing: 0.4px;
  margin-bottom: 6px;
}
.pinned-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}
.pinned-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  padding: 6px 4px;
  border-radius: 10px;
  min-width: 56px;
  max-width: 68px;
  transition: background 0.15s;
}
.pinned-item:hover {
  background: var(--bg-muted, #f3f4f6);
}
.favicon-wrap {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--pinned-icon-bg, #f3f4f6);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.favicon-img {
  object-fit: contain;
}
.favicon-fallback {
  font-size: 13px;
  color: var(--pinned-icon-color, #6b7280);
}
.pinned-name {
  font-size: 10px;
  color: var(--text-muted, #4b5563);
  text-align: center;
  width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}
.divider {
  height: 1px;
  background: var(--divider, #f3f4f6);
  margin: 0 6px 4px;
}
</style>
