import type { ApiResponse, Bookmark, SyncSnapshot } from './types'
import { getBaseUrl } from './storage'

function normalizeBaseUrl(input: string): string {
  const s = input.trim().replace(/\/+$/, '')
  return s
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<ApiResponse<T>> {
  const baseUrl = await getBaseUrl()
  if (!baseUrl) return { ok: false, error: '请先在设置中填写 baseUrl' }
  const url = `${normalizeBaseUrl(baseUrl)}${path.startsWith('/') ? '' : '/'}${path}`

  try {
    const res = await fetch(url, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    })
    const json = (await res.json().catch(() => null)) as ApiResponse<T> | null
    if (json && typeof json === 'object' && 'ok' in json) return json
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    return { ok: true, data: json as unknown as T }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '网络错误' }
  }
}

export async function login(password: string): Promise<ApiResponse<unknown>> {
  return apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  })
}

export async function logout(): Promise<ApiResponse<unknown>> {
  return apiFetch('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) })
}

export async function classifyBookmark(
  title: string,
  url: string,
  categories: { id: string; name: string }[]
): Promise<ApiResponse<{ categoryId: string | null; raw?: string }>> {
  return apiFetch('/api/ai/classify', {
    method: 'POST',
    body: JSON.stringify({ title, url, categories }),
  })
}

export async function putBookmarks(bookmarks: Bookmark[]): Promise<ApiResponse<unknown>> {
  return apiFetch('/api/data/bookmarks', {
    method: 'PUT',
    body: JSON.stringify(bookmarks),
  })
}

export async function addBookmarkExt(
  bookmark: Omit<Bookmark, 'id'> & { id?: string }
): Promise<ApiResponse<Bookmark>> {
  return apiFetch('/api/ext/bookmarks', {
    method: 'POST',
    body: JSON.stringify(bookmark),
  })
}

export async function fetchSnapshot(): Promise<ApiResponse<SyncSnapshot>> {
  const r = await apiFetch<{ bookmarks: unknown[]; categories: unknown[]; pinned: string[] }>(
    '/api/data/snapshot'
  )
  if (!r.ok) return { ok: false, error: r.error }
  const d = r.data ?? { bookmarks: [], categories: [], pinned: [] }
  return {
    ok: true,
    data: {
      bookmarks: Array.isArray(d.bookmarks) ? d.bookmarks : [],
      categories: Array.isArray(d.categories) ? d.categories : [],
      pinned: Array.isArray(d.pinned) ? d.pinned : [],
    },
  }
}

