import { useBookmarksStore } from '@/stores/bookmarks'
import { useHealthCheckStore } from '@/stores/healthCheck'
import type { Bookmark } from '@/types'
import { apiFetch } from '@/utils/api'

export async function checkBookmarkHealth(url: string): Promise<'ok' | 'warn' | 'error'> {
  const res = await apiFetch('/api/check-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  const json = await res.json().catch(() => ({}))
  return (json.health as 'ok' | 'warn' | 'error') ?? 'error'
}

export function useHealthCheck() {
  const bookmarksStore = useBookmarksStore()
  const healthCheckStore = useHealthCheckStore()

  async function checkAll() {
    for (const b of bookmarksStore.items) {
      healthCheckStore.currentCheckingBookmarkId = b.id
      try {
        const health = await checkBookmarkHealth(b.url)
        bookmarksStore.updateBookmark(b.id, { health })
      } finally {
        healthCheckStore.currentCheckingBookmarkId = null
      }
    }
  }

  async function checkOne(bookmark: Bookmark) {
    healthCheckStore.currentCheckingBookmarkId = bookmark.id
    try {
      const health = await checkBookmarkHealth(bookmark.url)
      bookmarksStore.updateBookmark(bookmark.id, { health })
    } finally {
      healthCheckStore.currentCheckingBookmarkId = null
    }
  }

  return { checkAll, checkOne }
}
