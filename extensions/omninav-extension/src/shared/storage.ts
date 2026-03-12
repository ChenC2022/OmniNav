const KEY_BASE_URL = 'omninav:baseUrl'
const KEY_SYNC_SNAPSHOT = 'omninav:syncSnapshot'
const KEY_SYNC_AT = 'omninav:syncAt'

export type StoredValues = {
  [KEY_BASE_URL]?: string
  [KEY_SYNC_SNAPSHOT]?: unknown
  [KEY_SYNC_AT]?: number
}

export async function getBaseUrl(): Promise<string | null> {
  const v = (await chrome.storage.local.get([KEY_BASE_URL])) as StoredValues
  const raw = v[KEY_BASE_URL]
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  if (!s) return null
  return s
}

export async function setBaseUrl(baseUrl: string): Promise<void> {
  await chrome.storage.local.set({ [KEY_BASE_URL]: baseUrl.trim() })
}

export async function setSyncSnapshot(snapshot: unknown): Promise<void> {
  await chrome.storage.local.set({
    [KEY_SYNC_SNAPSHOT]: snapshot,
    [KEY_SYNC_AT]: Date.now(),
  })
}

export async function getSyncAt(): Promise<number | null> {
  const v = (await chrome.storage.local.get([KEY_SYNC_AT])) as StoredValues
  return typeof v[KEY_SYNC_AT] === 'number' ? v[KEY_SYNC_AT] : null
}

export async function getSyncSnapshot<T = unknown>(): Promise<T | null> {
  const v = (await chrome.storage.local.get([KEY_SYNC_SNAPSHOT])) as StoredValues
  return (v[KEY_SYNC_SNAPSHOT] as T | undefined) ?? null
}


