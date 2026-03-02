import { useBookmarksStore } from '@/stores/bookmarks'
import type { Bookmark } from '@/types'

export async function checkBookmarkHealth(url: string): Promise<'ok' | 'warn' | 'error'> {
  const res = await fetch('/api/check-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  const json = await res.json().catch(() => ({}))
  return (json.health as 'ok' | 'warn' | 'error') ?? 'error'
}

export function useHealthCheck() {
  const bookmarksStore = useBookmarksStore()

  async function checkAll() {
    for (const b of bookmarksStore.items) {
      const health = await checkBookmarkHealth(b.url)
      bookmarksStore.updateBookmark(b.id, { health })
    }
  }

  async function checkOne(bookmark: Bookmark) {
    const health = await checkBookmarkHealth(bookmark.url)
    bookmarksStore.updateBookmark(bookmark.id, { health })
  }

  return { checkAll, checkOne }
}
