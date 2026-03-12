export type ApiOk<T> = { ok: true; data?: T }
export type ApiErr = { ok: false; error?: string; needInitialSetup?: boolean }
export type ApiResponse<T> = ApiOk<T> | ApiErr

export type Bookmark = {
  id: string
  title: string
  url: string
  description: string
  categoryId: string
  favicon?: string
  order?: number
}

export type Category = {
  id: string
  name: string
  order?: number
}

export type SyncSnapshot = {
  bookmarks: Bookmark[]
  categories: Category[]
  pinned: string[]
}

