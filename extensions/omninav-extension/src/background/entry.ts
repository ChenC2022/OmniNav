import { addBookmarkExt, apiFetch, fetchSnapshot, login, logout } from '../shared/api'
import { getSyncSnapshot, setSyncSnapshot } from '../shared/storage'
import type { Bookmark, Category, SyncSnapshot } from '../shared/types'

// 用内嵌 PNG（1×1 透明像素）作为通知图标，避免找不到图标文件报错
const NOTIFY_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function notify(title: string, message: string) {
  chrome.notifications?.create({
    type: 'basic',
    iconUrl: NOTIFY_ICON,
    title,
    message,
  })
}

type Msg =
  | { type: 'login'; password: string }
  | { type: 'logout' }
  | { type: 'sync' }
  | { type: 'addBookmark'; url: string; title: string; categoryId?: string }

async function addBookmarkToKv(
  url: string,
  title: string,
  categoryId?: string
): Promise<{ ok: boolean; error?: string; duplicate?: boolean }> {
  const snap = await getSyncSnapshot<SyncSnapshot>()
  const categories: Category[] = Array.isArray(snap?.categories) ? snap!.categories : []

  // 解析 categoryId：未传入则找「未分类」分类
  let resolvedCategoryId = categoryId
  if (!resolvedCategoryId) {
    const UNCAT_NAMES = ['未分类', '未分类链接', '快捷链接']
    const uncatCat = categories.find((c) => UNCAT_NAMES.includes(c.name ?? ''))
    resolvedCategoryId = uncatCat?.id ?? 'uncategorized'
  }

  // 调增量端点，后端负责去重与合并写入
  const r = await addBookmarkExt({
    title: title.trim() || url,
    url,
    description: '',
    categoryId: resolvedCategoryId,
  })

  if (!r.ok) {
    // 后端返回 DUPLICATE 时映射为 duplicate 标志
    const isDup = (r as { error?: string; code?: string }).code === 'DUPLICATE'
      || (r as { error?: string }).error?.includes('已存在')
    return { ok: false, duplicate: isDup, error: r.error ?? '写入失败' }
  }

  // 更新本地缓存：将新书签追加到快照中
  const newBookmark = (r as { ok: true; data?: Bookmark }).data
  if (newBookmark && snap) {
    const bookmarks: Bookmark[] = Array.isArray(snap.bookmarks) ? snap.bookmarks : []
    await setSyncSnapshot({ ...snap, bookmarks: [...bookmarks, newBookmark] })
  }

  return { ok: true }
}

// 队列保留供后续 PATCH/DELETE 端点使用（目前 addBookmarkToKv 已由后端串行，此处仅做并发保护）
let writeQueue: Promise<unknown> = Promise.resolve()
function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(fn).catch(fn)
  writeQueue = next.then(() => {}, () => {})
  return next as Promise<T>
}

chrome.runtime.onInstalled.addListener(() => {
  // 一级菜单（父级，无操作）
  chrome.contextMenus.create({
    id: 'omninav-parent',
    title: '添加到 OmniNav',
    contexts: ['page'],
  })
  // 二级：自动分类
  chrome.contextMenus.create({
    id: 'omninav-add-classify',
    parentId: 'omninav-parent',
    title: '自动分类',
    contexts: ['page'],
  })
  // 二级：暂不分类
  chrome.contextMenus.create({
    id: 'omninav-add-uncat',
    parentId: 'omninav-parent',
    title: '暂不分类',
    contexts: ['page'],
  })
  chrome.runtime.openOptionsPage().catch(() => {})
})

type ClassifyResp = { ok: boolean; categoryId: string | null; error?: string }

async function classifyAndAdd(url: string, title: string): Promise<void> {
  const snap = await getSyncSnapshot<SyncSnapshot>()
  const categories: Category[] = Array.isArray(snap?.categories) ? snap!.categories : []

  // URL 去重（先快速本地判断，避免不必要的 AI 调用）
  const bookmarks: Bookmark[] = Array.isArray(snap?.bookmarks) ? snap!.bookmarks : []
  if (bookmarks.some((b) => b.url === url)) {
    notify('OmniNav', '该链接已存在，无需重复添加')
    return
  }

  // 调用 AI 分类
  let categoryId: string | null = null
  let categoryName = '未分类'
  if (categories.length) {
    const r = await apiFetch<ClassifyResp>('/api/ai/classify', {
      method: 'POST',
      body: JSON.stringify({ title, url, categories }),
    })
    const resp = r as unknown as ClassifyResp
    categoryId = resp.categoryId ?? (r as { data?: ClassifyResp }).data?.categoryId ?? null
    if (categoryId) {
      categoryName = categories.find((c) => c.id === categoryId)?.name ?? categoryName
    }
  }

  const result = await enqueueWrite(() => addBookmarkToKv(url, title, categoryId ?? undefined))
  if (result.duplicate) {
    notify('OmniNav', '该链接已存在，无需重复添加')
  } else if (!result.ok) {
    notify('OmniNav', `添加失败：${result.error ?? '未知错误'}`)
  } else {
    notify('OmniNav', `已添加到「${categoryName}」：${title}`)
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const url = tab?.url ?? ''
  const title = tab?.title ?? url
  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) return

  if (info.menuItemId === 'omninav-add-classify') {
    classifyAndAdd(url, title).catch(() => {
      notify('OmniNav', '添加失败，请检查网络或登录状态')
    })
  } else if (info.menuItemId === 'omninav-add-uncat') {
    enqueueWrite(() => addBookmarkToKv(url, title))
      .then((r) => {
        if (r.duplicate) {
          notify('OmniNav', '该链接已存在，无需重复添加')
        } else if (!r.ok) {
          notify('OmniNav', `添加失败：${r.error ?? '未知错误'}`)
        } else {
          notify('OmniNav', `已添加到「未分类」：${title}`)
        }
      })
      .catch(() => { notify('OmniNav', '添加失败，请检查网络或登录状态') })
  }
})

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'open-popup') return
  chrome.runtime.openOptionsPage().catch(() => {})
})

chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse) => {
  ;(async () => {
    if (!msg || typeof msg !== 'object') return sendResponse({ ok: false, error: 'Invalid message' })

    if (msg.type === 'login') {
      const r = await login(msg.password)
      return sendResponse(r)
    }

    if (msg.type === 'logout') {
      const r = await logout()
      return sendResponse(r)
    }

    if (msg.type === 'sync') {
      const r = await fetchSnapshot()
      if (r.ok && r.data) await setSyncSnapshot(r.data)
      return sendResponse(r)
    }

    if (msg.type === 'addBookmark') {
      const r = await enqueueWrite(() => addBookmarkToKv(msg.url, msg.title, msg.categoryId))
      return sendResponse(r)
    }

    return sendResponse({ ok: false, error: 'Unknown message' })
  })().catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : 'Unknown error' }))

  return true
})
