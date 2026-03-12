<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Bookmark } from '../../shared/types'

const props = defineProps<{
  pinnedBookmarks: Bookmark[]
  baseUrl?: string
}>()
const emit = defineEmits<{ open: [url: string] }>()

// 降级阶段：custom → backend_proxy（后端/api/favicon代理）→ favicon_ico → letter
type Stage = 'custom' | 'backend_proxy' | 'favicon_ico' | 'letter'
const stages = ref<Map<string, Stage>>(new Map())

function initStage(b: Bookmark): Stage {
  return b.favicon?.trim() ? 'custom' : 'backend_proxy'
}

watch(
  () => props.pinnedBookmarks,
  (list) => {
    list.forEach((b) => {
      if (!stages.value.has(b.id)) {
        stages.value.set(b.id, initStage(b))
      }
    })
  },
  { immediate: true }
)

function getSrc(b: Bookmark): string {
  const stage = stages.value.get(b.id) ?? initStage(b)
  if (stage === 'custom') return b.favicon?.trim() ?? ''
  if (stage === 'backend_proxy') {
    const base = props.baseUrl?.trim().replace(/\/+$/, '')
    if (base) {
      return `${base}/api/favicon?url=${encodeURIComponent(b.url)}&sz=32`
    }
    // baseUrl 未配置时直接跳 favicon_ico
    try { return `${new URL(b.url).origin}/favicon.ico` } catch { return '' }
  }
  if (stage === 'favicon_ico') {
    try { return `${new URL(b.url).origin}/favicon.ico` } catch { return '' }
  }
  return '' // letter
}

function onError(b: Bookmark) {
  const cur = stages.value.get(b.id) ?? initStage(b)
  const next: Stage =
    cur === 'custom'        ? 'backend_proxy' :
    cur === 'backend_proxy' ? 'favicon_ico'   :
    'letter'
  stages.value.set(b.id, next)
}

function fallbackLetter(b: Bookmark): string {
  return (b.title?.trim() || b.url || '?').charAt(0).toUpperCase()
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
          <template v-if="(stages.get(b.id) ?? 'google_s2') !== 'letter' && getSrc(b)">
            <img
              :src="getSrc(b)"
              width="20"
              height="20"
              class="favicon-img"
              @error="onError(b)"
            />
          </template>
          <span v-else class="favicon-letter">{{ fallbackLetter(b) }}</span>
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
  display: grid;
  grid-template-columns: repeat(auto-fill, 67px);
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
  width: 67px;
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
.favicon-letter {
  font-size: 14px;
  font-weight: 600;
  color: var(--pinned-icon-color, #6b7280);
  line-height: 1;
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
