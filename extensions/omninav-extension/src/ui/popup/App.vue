<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { Bookmark, Category } from '../../shared/types'
import { getSyncAt, getSyncSnapshot, getBaseUrl } from '../../shared/storage'
import { apiFetch } from '../../shared/api'
import PinnedGrid from './PinnedGrid.vue'
import SearchList from './SearchList.vue'
import ConfirmCard from './ConfirmCard.vue'

type Snapshot = { bookmarks?: Bookmark[]; categories?: Category[]; pinned?: string[] }
type ApiResp = { ok: boolean; error?: string; data?: unknown; duplicate?: boolean }
type ClassifyResp = { ok: boolean; categoryId: string | null; error?: string }
type ConfirmState = {
  title: string
  url: string
  suggestedCategoryId: string | null
  isClassifying: boolean
}

const bookmarks = ref<Bookmark[]>([])
const categories = ref<Category[]>([])
const pinnedIds = ref<string[]>([])
const syncAt = ref<number | null>(null)
const query = ref('')
const message = ref<string | null>(null)
const confirmState = ref<ConfirmState | null>(null)
const baseUrl = ref<string>('')

const bookmarkMap = computed(() => new Map(bookmarks.value.map((b) => [b.id, b])))

const pinnedBookmarks = computed(() =>
  pinnedIds.value.map((id) => bookmarkMap.value.get(id)).filter((b): b is Bookmark => !!b)
)

const catMap = computed(() => new Map(categories.value.map((c) => [c.id, c.name])))

const searchResults = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return []
  const parts = q.split(/\s+/).filter(Boolean)
  return bookmarks.value
    .filter((b) => {
      const hay = `${b.title ?? ''} ${b.url ?? ''} ${b.description ?? ''}`.toLowerCase()
      return parts.every((p) => hay.includes(p))
    })
    .slice(0, 30)
})

function fmtTime(ts: number | null): string {
  if (!ts) return '暂无'
  return new Date(ts).toLocaleString()
}

async function loadData() {
  const [snap, base] = await Promise.all([
    getSyncSnapshot<Snapshot>(),
    getBaseUrl(),
  ])
  const s = snap ?? {}
  bookmarks.value = Array.isArray(s.bookmarks) ? (s.bookmarks as Bookmark[]) : []
  categories.value = Array.isArray(s.categories) ? (s.categories as Category[]) : []
  pinnedIds.value = Array.isArray(s.pinned) ? s.pinned : []
  syncAt.value = await getSyncAt()
  baseUrl.value = base ?? ''
}

onMounted(async () => {
  await loadData()
  // 静默同步
  chrome.runtime.sendMessage({ type: 'sync' })
    .then(async (r) => {
      const resp = r as ApiResp
      if (resp?.ok) await loadData()
    })
    .catch(() => {})
})

async function doSync() {
  message.value = null
  const r = (await chrome.runtime.sendMessage({ type: 'sync' })) as ApiResp
  if (!r?.ok) { message.value = r?.error ?? '同步失败'; return }
  message.value = '同步成功'
  await loadData()
}

function openUrl(url: string) {
  chrome.tabs.create({ url }).catch(() => {})
  window.close()
}

async function openOptions() {
  chrome.runtime.openOptionsPage().catch(() => {})
}

async function openAi() {
  if (typeof chrome.sidePanel?.open === 'function') {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    const tabId = tabs[0]?.id
    if (tabId) {
      chrome.sidePanel.open({ tabId }).catch(() => {
        chrome.tabs.create({ url: chrome.runtime.getURL('ai.html') }).catch(() => {})
      })
    }
  } else {
    chrome.tabs.create({ url: chrome.runtime.getURL('ai.html') }).catch(() => {})
  }
  window.close()
}

async function openWebApp() {
  const base = await getBaseUrl()
  if (!base) { message.value = '请先在设置中填写 baseUrl'; return }
  chrome.tabs.create({ url: base.replace(/\/$/, '') }).catch(() => {})
  window.close()
}

async function addBookmark() {
  message.value = null
  confirmState.value = null

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const url = tab?.url ?? ''
  const title = tab?.title ?? url

  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
    message.value = '当前页面无法收藏（chrome:// 页面）'
    return
  }

  if (bookmarks.value.some((b) => b.url === url)) {
    message.value = '该链接已存在，无需重复添加'
    return
  }

  // 展示 AI 分类中卡片
  confirmState.value = { title, url, suggestedCategoryId: null, isClassifying: true }

  let suggestedId: string | null = null
  if (categories.value.length) {
    const r = await apiFetch<ClassifyResp>('/api/ai/classify', {
      method: 'POST',
      body: JSON.stringify({ title, url, categories: categories.value }),
    })
    const resp = r as unknown as ClassifyResp
    suggestedId = resp.categoryId ?? (r as { data?: ClassifyResp }).data?.categoryId ?? null
  }

  confirmState.value = { title, url, suggestedCategoryId: suggestedId, isClassifying: false }
}

async function onConfirmSave(payload: { title: string; categoryId: string | null }) {
  if (!confirmState.value) return
  const { url } = confirmState.value
  confirmState.value = null

  const r = (await chrome.runtime.sendMessage({
    type: 'addBookmark',
    url,
    title: payload.title,
    categoryId: payload.categoryId,
  })) as ApiResp

  if (r?.duplicate) {
    message.value = '该链接已存在，无需重复添加'
    return
  }
  if (!r?.ok) {
    message.value = r?.error ?? '保存失败'
    return
  }

  message.value = `✓ 已收藏：${payload.title}`
  await loadData()
}

function onConfirmCancel() {
  confirmState.value = null
  message.value = null
}
</script>

<template>
  <div class="popup-root">
    <!-- 顶栏 -->
    <div class="topbar">
      <div class="topbar-left">
        <img src="/logo.svg" alt="OmniNav" class="logo" />
        <span class="title">OmniNav</span>
      </div>
      <div class="icon-btns">
        <button class="icon-btn primary" title="收藏当前页" @click="addBookmark">
          <span class="ms">add_link</span>
        </button>
        <button class="icon-btn teal" title="AI 对话" @click="openAi">
          <span class="ms">auto_awesome</span>
        </button>
        <button class="icon-btn dark" title="同步数据" @click="doSync">
          <span class="ms">sync</span>
        </button>
        <button class="icon-btn" title="设置" @click="openOptions">
          <span class="ms">settings</span>
        </button>
      </div>
    </div>

    <!-- 消息条 -->
    <div v-if="message" class="message-box">{{ message }}</div>

    <!-- AI 分类确认卡片 -->
    <ConfirmCard
      v-if="confirmState"
      :title="confirmState.title"
      :url="confirmState.url"
      :categories="categories"
      :suggested-category-id="confirmState.suggestedCategoryId"
      :is-classifying="confirmState.isClassifying"
      @save="onConfirmSave"
      @cancel="onConfirmCancel"
    />

    <!-- 未初始化提示 -->
    <div v-if="!syncAt" class="warn-box">
      还没完成初始化：请先进入「设置」填写 baseUrl → 授权站点权限 → 登录 → 同步。
    </div>

    <template v-if="bookmarks.length">
      <!-- 搜索栏 -->
      <div class="search-wrap">
        <span class="ms search-icon">search</span>
        <input
          v-model="query"
          placeholder="搜索书签…"
          class="search-input"
        />
      </div>

      <!-- 搜索结果 -->
      <SearchList
        v-if="query.trim()"
        :items="searchResults"
        :cat-map="catMap"
        @open="openUrl"
      />

      <!-- 置顶区 -->
      <PinnedGrid
        v-if="pinnedBookmarks.length"
        :pinned-bookmarks="pinnedBookmarks"
        :base-url="baseUrl"
        @open="openUrl"
      />

      <!-- 同步时间 -->
      <div class="sync-at">上次同步：{{ fmtTime(syncAt) }}</div>
    </template>
    <div v-else class="no-data">尚无书签快照（请先同步）</div>

    <!-- 底部：打开网页版 -->
    <div class="footer">
      <button class="btn-web" @click="openWebApp">在网页版中管理书签 →</button>
    </div>
  </div>
</template>

<style scoped>
.popup-root {
  font-family: ui-sans-serif, system-ui, sans-serif;
  width: 340px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--bg);
  color: var(--text);
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.topbar-left {
  display: flex;
  align-items: center;
  gap: 7px;
}
.logo {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  flex-shrink: 0;
}
.title {
  font-weight: 700;
  font-size: 14px;
  color: var(--text);
}
.icon-btns {
  display: flex;
  gap: 5px;
}
.icon-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--border, #e5e7eb);
  background: var(--bg);
  color: var(--text-muted, #4b5563);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
  flex-shrink: 0;
}
.icon-btn:hover { background: var(--bg-muted, #f3f4f6); }
.icon-btn.primary { background: #4f46e5; border-color: #4f46e5; color: white; }
.icon-btn.primary:hover { background: #4338ca; }
.icon-btn.teal { background: #0891b2; border-color: #0891b2; color: white; }
.icon-btn.teal:hover { background: #0e7490; }
.icon-btn.dark { background: #1f2937; border-color: #1f2937; color: white; }
.icon-btn.dark:hover { background: #374151; }
.ms {
  font-family: 'Material Symbols Outlined';
  font-size: 18px;
  line-height: 1;
  font-weight: normal;
  font-style: normal;
  letter-spacing: normal;
  text-transform: none;
  display: inline-block;
  white-space: nowrap;
  direction: ltr;
  -webkit-font-smoothing: antialiased;
}
.message-box {
  padding: 7px 10px;
  border-radius: 9px;
  background: var(--msg-bg, #f6f6f6);
  border: 1px solid var(--msg-border, #e5e5e5);
  color: var(--text-muted);
  font-size: 12px;
}
.warn-box {
  padding: 10px;
  border-radius: 10px;
  background: var(--bg-warn, #fff7ed);
  border: 1px solid var(--border-warn, #fed7aa);
  color: var(--text-warn, #9a3412);
  font-size: 12px;
  line-height: 1.6;
}
.search-wrap {
  position: relative;
}
.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-faint, #9ca3af);
  font-size: 18px;
  pointer-events: none;
}
.search-input {
  width: 100%;
  padding: 9px 12px 9px 38px;
  border-radius: 999px;
  border: 1px solid var(--input-border, #e5e7eb);
  font-size: 13px;
  outline: none;
  background: var(--input-bg, #fafafa);
  color: var(--text);
  box-sizing: border-box;
  font-family: inherit;
}
.search-input:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
}
.sync-at {
  color: var(--sync-text, #9ca3af);
  font-size: 11px;
  text-align: right;
}
.no-data {
  color: var(--text-faint, #9ca3af);
  font-size: 12px;
  text-align: center;
  padding: 8px 0;
}
.footer {
  padding-top: 4px;
  border-top: 1px solid var(--divider, #f3f4f6);
}
.btn-web {
  width: 100%;
  padding: 6px 0;
  border-radius: 8px;
  border: 1px solid var(--web-btn-border, #e5e7eb);
  background: var(--web-btn-bg, white);
  color: var(--web-btn-text, #4b5563);
  font-size: 12px;
  cursor: pointer;
  text-align: center;
  font-family: inherit;
  transition: background 0.15s;
}
.btn-web:hover { background: var(--bg-muted, #f3f4f6); }
</style>
