import { onMounted } from 'vue'
import { useBookmarksStore } from '@/stores/bookmarks'
import { useCategoriesStore } from '@/stores/categories'
import { usePinnedStore } from '@/stores/pinned'
import { useSyncStore } from '@/stores/sync'
import type { Bookmark } from '@/types'
import type { Category } from '@/types'
import { nanoid } from '@/utils/id'

const UNCATEGORIZED_NAME = '未分类'
const UNCATEGORIZED_NAMES_LEGACY = ['未分类链接', '快捷链接']

const API = {
  bookmarks: '/api/data/bookmarks',
  categories: '/api/data/categories',
  pinned: '/api/data/pinned',
}

async function get<T>(path: string): Promise<{ ok: true; data: T } | { ok: false }> {
  try {
    const res = await fetch(path)
    if (!res.ok) return { ok: false }
    const json = await res.json()
    if (!json.ok) return { ok: false }
    return { ok: true, data: json.data as T }
  } catch {
    return { ok: false }
  }
}

async function put<T>(path: string, data: T): Promise<void> {
  const res = await fetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`PUT ${path} ${res.status}`)
  const json = await res.json().catch(() => ({}))
  if (json.ok === false) throw new Error(json.error || 'Request failed')
}

export function useDataSync() {
  const bookmarks = useBookmarksStore()
  const categories = useCategoriesStore()
  const pinned = usePinnedStore()
  const syncStore = useSyncStore()

  async function loadAndMaybeSeed() {
    syncStore.setSyncing()
    try {
    const [bRes, cRes, pRes] = await Promise.all([
      get<Bookmark[]>(API.bookmarks),
      get<Category[]>(API.categories),
      get<string[]>(API.pinned),
    ])

    const bookmarksList = bRes.ok && Array.isArray(bRes.data) ? bRes.data : []
    const categoriesList = cRes.ok && Array.isArray(cRes.data) ? cRes.data : []
    const pinnedList = pRes.ok && Array.isArray(pRes.data) ? pRes.data : []

    bookmarks.setBookmarks(bookmarksList)
    categories.setCategories(categoriesList)
    pinned.setIds(pinnedList)

    // 确保始终存在「未分类」分类，以便首页未分类区域显示（兼容旧 KV 或仅含演示分类的数据）
    const hasUncategorized = categoriesList.some(
      (c) => c.name === UNCATEGORIZED_NAME || UNCATEGORIZED_NAMES_LEGACY.includes(c.name)
    )
    if (!hasUncategorized) {
      const newCat: Category = {
        id: nanoid(),
        name: UNCATEGORIZED_NAME,
        order: categoriesList.length,
      }
      categories.setCategories([...categoriesList, newCat])
      put(API.categories, [...categoriesList, newCat]).catch(() => {})
    }

    // 不再在首次空数据时自动注入演示数据，新部署保持空状态；演示数据请到设置页「加载演示数据」手动加载
    cleanOrphanedPinned()
    } finally {
      syncStore.setIdle()
    }
  }

  function cleanOrphanedPinned() {
    const bookmarkIds = new Set(bookmarks.items.map((b) => b.id))
    const valid = pinned.ids.filter((id) => bookmarkIds.has(id))
    if (valid.length !== pinned.ids.length) {
      pinned.setIds(valid)
      put(API.pinned, valid).catch(() => {})
    }
  }

  onMounted(() => {
    loadAndMaybeSeed()
  })

  async function saveBookmarks() {
    await put(API.bookmarks, bookmarks.items)
  }

  async function saveCategories() {
    await put(API.categories, categories.items)
  }

  async function savePinned() {
    await put(API.pinned, pinned.ids)
  }

  return {
    saveBookmarks,
    saveCategories,
    savePinned,
  }
}
