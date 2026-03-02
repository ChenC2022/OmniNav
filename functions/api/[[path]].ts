import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'

type Bindings = {
  KV_OMNINAV: KVNamespace
}

const app = new Hono<{ Bindings: Bindings }>().basePath('/api')

// 通用：从 KV 读取 JSON，未定义时返回 null
async function getJson<T>(kv: KVNamespace | undefined, key: string): Promise<T | null> {
  if (!kv) return null
  const raw = await kv.get(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

// GET/PUT /api/data/bookmarks
app.get('/data/bookmarks', async (c) => {
  const kv = c.env.KV_OMNINAV
  if (!kv) return c.json({ ok: false, error: 'KV not available' }, 503)
  const data = await getJson<unknown[]>(kv, 'bookmarks')
  return c.json({ ok: true, data: data ?? [] })
})
app.put('/data/bookmarks', async (c) => {
  const kv = c.env.KV_OMNINAV
  if (!kv) return c.json({ ok: false, error: 'KV not available' }, 503)
  const body = await c.req.json<unknown[]>().catch(() => null)
  if (!Array.isArray(body)) return c.json({ ok: false, error: 'Invalid body' }, 400)
  await kv.put('bookmarks', JSON.stringify(body))
  return c.json({ ok: true })
})

// GET/PUT /api/data/categories
app.get('/data/categories', async (c) => {
  const kv = c.env.KV_OMNINAV
  if (!kv) return c.json({ ok: false, error: 'KV not available' }, 503)
  const data = await getJson<unknown[]>(kv, 'categories')
  return c.json({ ok: true, data: data ?? [] })
})
app.put('/data/categories', async (c) => {
  const kv = c.env.KV_OMNINAV
  if (!kv) return c.json({ ok: false, error: 'KV not available' }, 503)
  const body = await c.req.json<unknown[]>().catch(() => null)
  if (!Array.isArray(body)) return c.json({ ok: false, error: 'Invalid body' }, 400)
  await kv.put('categories', JSON.stringify(body))
  return c.json({ ok: true })
})

// 未分类的分类名（与前端 Home.vue 一致，含旧名以兼容）
const UNCATEGORIZED_NAMES = ['未分类', '未分类链接', '快捷链接']

/** 一次性清理：将「未分类链接」中的书签随机保留 30 条，其余删除；并同步更新 pinned */
app.post('/admin/cleanup-uncategorized', async (c) => {
  const kv = c.env.KV_OMNINAV
  if (!kv) return c.json({ ok: false, error: 'KV not available' }, 503)
  const categories = await getJson<Array<{ id: string; name: string }>>(kv, 'categories')
  const bookmarks = await getJson<Array<{ id: string; categoryId: string }>>(kv, 'bookmarks')
  const pinned = await getJson<string[]>(kv, 'pinned')
  if (!Array.isArray(categories) || !Array.isArray(bookmarks)) {
    return c.json({ ok: false, error: 'Invalid data' }, 500)
  }
  const uncatCategory = categories.find((cat) =>
    UNCATEGORIZED_NAMES.includes(cat?.name ?? '')
  )
  if (!uncatCategory?.id) {
    return c.json({ ok: false, error: '未找到「未分类」分类' }, 400)
  }
  const uncatId = uncatCategory.id
  const uncategorized = bookmarks.filter((b) => b && b.categoryId === uncatId)
  const others = bookmarks.filter((b) => b && b.categoryId !== uncatId)
  const keepCount = 30
  if (uncategorized.length <= keepCount) {
    return c.json({
      ok: true,
      message: `未分类当前共 ${uncategorized.length} 条，无需清理`,
      kept: uncategorized.length,
      removed: 0,
    })
  }
  // Fisher–Yates shuffle，用 crypto.getRandomValues
  const indices = Array.from({ length: uncategorized.length }, (_, i) => i)
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / 0xffffffff) * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]]
  }
  const toKeep = indices.slice(0, keepCount).map((i) => uncategorized[i])
  const newBookmarks = [...others, ...toKeep]
  await kv.put('bookmarks', JSON.stringify(newBookmarks))
  const newBookmarkIds = new Set(newBookmarks.map((b) => b.id))
  const validPinned = Array.isArray(pinned) ? pinned.filter((id) => newBookmarkIds.has(id)) : []
  if (validPinned.length !== (pinned?.length ?? 0)) {
    await kv.put('pinned', JSON.stringify(validPinned))
  }
  return c.json({
    ok: true,
    message: `已随机保留 ${keepCount} 条，删除 ${uncategorized.length - keepCount} 条`,
    kept: keepCount,
    removed: uncategorized.length - keepCount,
  })
})

// GET/PUT /api/data/pinned
app.get('/data/pinned', async (c) => {
  const kv = c.env.KV_OMNINAV
  if (!kv) return c.json({ ok: false, error: 'KV not available' }, 503)
  const data = await getJson<string[]>(kv, 'pinned')
  return c.json({ ok: true, data: data ?? [] })
})
app.put('/data/pinned', async (c) => {
  const kv = c.env.KV_OMNINAV
  if (!kv) return c.json({ ok: false, error: 'KV not available' }, 503)
  const body = await c.req.json<string[]>().catch(() => null)
  if (!Array.isArray(body)) return c.json({ ok: false, error: 'Invalid body' }, 400)
  await kv.put('pinned', JSON.stringify(body))
  return c.json({ ok: true })
})

// GET/PUT /api/data/settings（返回时脱敏 api_key）
app.get('/data/settings', async (c) => {
  const kv = c.env.KV_OMNINAV
  if (!kv) return c.json({ ok: false, error: 'KV not available' }, 503)
  let data = await getJson<Record<string, unknown>>(kv, 'settings')
  if (data && typeof data === 'object' && data.ai && typeof data.ai === 'object' && 'apiKey' in data.ai) {
    const ai = { ...(data.ai as Record<string, unknown>) }
    delete ai.apiKey
    data = { ...data, ai }
  }
  return c.json({ ok: true, data: data ?? {} })
})
app.put('/data/settings', async (c) => {
  const kv = c.env.KV_OMNINAV
  if (!kv) return c.json({ ok: false, error: 'KV not available' }, 503)
  const body = await c.req.json<Record<string, unknown>>().catch(() => null)
  if (!body || typeof body !== 'object') return c.json({ ok: false, error: 'Invalid body' }, 400)
  const existing = await getJson<Record<string, unknown>>(kv, 'settings')
  const merged = { ...existing, ...body } as Record<string, unknown>
  if (body.ai && typeof body.ai === 'object') {
    const existingAi = (existing?.ai && typeof existing.ai === 'object' ? existing.ai : {}) as Record<string, unknown>
    const aiMerged = { ...existingAi, ...(body.ai as Record<string, unknown>) }
    if (!('apiKey' in (body.ai as object)) || (body.ai as Record<string, unknown>).apiKey === '') {
      if ('apiKey' in existingAi) aiMerged.apiKey = existingAi.apiKey
    }
    merged.ai = aiMerged
  }
  await kv.put('settings', JSON.stringify(merged))
  return c.json({ ok: true })
})

// GET /api/favicon?url=https://example.com → 代理获取 favicon（先试 Google S2，失败则试站点 /favicon.ico）
const FAVICON_TIMEOUT_MS = 4000
async function fetchWithTimeout(url: string, opts: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const tid = setTimeout(() => controller.abort(), FAVICON_TIMEOUT_MS)
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal })
    clearTimeout(tid)
    return res
  } catch {
    clearTimeout(tid)
    throw new Error('Favicon fetch timeout or error')
  }
}

app.get('/favicon', async (c) => {
  const raw = c.req.query('url')
  if (!raw || typeof raw !== 'string') return c.json({ ok: false, error: 'Missing url' }, 400)
  let domain: string
  let origin: string
  try {
    const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`)
    domain = u.hostname
    origin = u.origin
  } catch {
    return c.json({ ok: false, error: 'Invalid url' }, 400)
  }
  const size = Math.min(128, Math.max(16, Number(c.req.query('sz')) || 32))
  const headers = { 'User-Agent': 'OmniNav/1' }

  // 1) 先试 Google S2
  const googleUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`
  try {
    const res = await fetchWithTimeout(googleUrl, { headers })
    if (res.ok) {
      const blob = await res.arrayBuffer()
      const contentType = res.headers.get('Content-Type') || 'image/x-icon'
      return new Response(blob, { headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=86400' } })
    }
  } catch {
    /* 继续尝试站点 favicon */
  }

  // 2) 失败则试站点 /favicon.ico
  try {
    const res = await fetchWithTimeout(`${origin}/favicon.ico`, { headers })
    if (res.ok) {
      const blob = await res.arrayBuffer()
      const contentType = res.headers.get('Content-Type') || 'image/x-icon'
      return new Response(blob, { headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=86400' } })
    }
  } catch {
    /* 两路都失败则返回 502 */
  }

  return c.json({ ok: false, error: 'Favicon unavailable' }, 502)
})

// POST /api/extract-meta Body: { "url": "https://..." } → 抓取页面 title + meta description，用于自动归类深度分析
const EXTRACT_META_TIMEOUT_MS = 10000
app.post('/extract-meta', async (c) => {
  const body = await c.req.json<{ url?: string }>().catch(() => ({}))
  const rawUrl = body?.url
  if (!rawUrl || typeof rawUrl !== 'string') return c.json({ ok: false, error: 'Missing url' }, 400)
  let url: string
  try {
    const u = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`)
    url = u.href
  } catch {
    return c.json({ ok: false, error: 'Invalid url' }, 400)
  }
  const controller = new AbortController()
  const tid = setTimeout(() => controller.abort(), EXTRACT_META_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OmniNav/1; +https://github.com/omninav)' },
    })
    clearTimeout(tid)
    if (!res.ok) return c.json({ ok: false, error: `HTTP ${res.status}` }, 200)
    const html = await res.text()
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 200) : undefined
    const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i)
      || html.match(/<meta\s+content=["']([^"']*)["']\s+name=["']description["']/i)
    const description = descMatch ? descMatch[1].trim().slice(0, 500) : undefined
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
    let snippet: string | undefined
    if (bodyMatch) {
      const text = bodyMatch[1].replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      snippet = text.slice(0, 300)
    }
    return c.json({ ok: true, title, description, snippet })
  } catch (e) {
    clearTimeout(tid)
    return c.json({ ok: false, error: e instanceof Error ? e.message : 'Fetch failed' }, 200)
  }
})

// POST /api/check-url Body: { "url": "https://..." } → 返回可达性
app.post('/check-url', async (c) => {
  const body = await c.req.json<{ url?: string }>().catch(() => ({}))
  const url = body?.url
  if (!url || typeof url !== 'string') return c.json({ ok: false, error: 'Missing url' }, 400)
  const start = Date.now()
  const controller = new AbortController()
  const tid = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal })
    clearTimeout(tid)
    const latency = Date.now() - start
    const status = res.status
    const health = status >= 200 && status < 400 ? 'ok' : status === 404 || status >= 500 ? 'error' : 'warn'
    return c.json({ ok: true, status, latency, health })
  } catch {
    clearTimeout(tid)
    const latency = Date.now() - start
    return c.json({ ok: true, status: 0, latency, health: 'error' })
  }
})

// GET /api/weather?lat=&lon= → 代理 Open-Meteo（无需 API Key）
app.get('/weather', async (c) => {
  const lat = c.req.query('lat')
  const lon = c.req.query('lon')
  const latitude = lat ? Number(lat) : 39.9
  const longitude = lon ? Number(lon) : 116.4
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return c.json({ ok: false, error: 'Invalid lat/lon' }, 400)
  }
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'OmniNav/1' } })
    if (!res.ok) return c.json({ ok: false, error: 'Weather fetch failed' }, 502)
    const data = await res.json() as { current?: { temperature_2m?: number; weather_code?: number } }
    return c.json({
      ok: true,
      temp: data.current?.temperature_2m ?? null,
      code: data.current?.weather_code ?? null,
    })
  } catch (e) {
    return c.json({ ok: false, error: String(e) }, 502)
  }
})

// GET /api/geocode?name=xxx → 代理 Open-Meteo 地理编码，搜索城市
app.get('/geocode', async (c) => {
  const name = (c.req.query('name') ?? '').trim()
  if (name.length < 2) return c.json({ ok: true, results: [] })
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=10&language=zh`
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'OmniNav/1' } })
    if (!res.ok) return c.json({ ok: false, error: 'Geocode failed' }, 502)
    const data = (await res.json()) as { results?: Array<{ name: string; latitude: number; longitude: number; country_code?: string; admin1?: string }> }
    const results = (data.results ?? []).map((r) => ({
      name: r.name,
      lat: r.latitude,
      lon: r.longitude,
      countryCode: r.country_code ?? '',
      admin1: r.admin1 ?? '',
    }))
    return c.json({ ok: true, results })
  } catch (e) {
    return c.json({ ok: false, error: String(e) }, 502)
  }
})

// GET /api/reverse-geocode?lat=&lon= → 逆地理编码获取城市名（Nominatim）
app.get('/reverse-geocode', async (c) => {
  const lat = c.req.query('lat')
  const lon = c.req.query('lon')
  const latitude = lat ? Number(lat) : null
  const longitude = lon ? Number(lon) : null
  if (latitude == null || longitude == null || Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return c.json({ ok: false, error: 'Invalid lat/lon' }, 400)
  }
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'OmniNav/1 (https://github.com/omninav)' } })
    if (!res.ok) return c.json({ ok: false, error: 'Reverse geocode failed' }, 502)
    const data = (await res.json()) as { address?: { city?: string; town?: string; village?: string; state?: string; country?: string } }
    const addr = data.address ?? {}
    const cityName = addr.city ?? addr.town ?? addr.village ?? addr.state ?? addr.country ?? ''
    return c.json({ ok: true, cityName, address: addr })
  } catch (e) {
    return c.json({ ok: false, error: String(e) }, 502)
  }
})

// POST /api/ai/chat：从 KV 读取 AI 配置，转发 OpenAI 兼容接口（非流式）
app.post('/ai/chat', async (c) => {
  const kv = c.env.KV_OMNINAV
  if (!kv) return c.json({ ok: false, error: 'KV not available' }, 503)
  const settings = await getJson<Record<string, unknown>>(kv, 'settings')
  const ai = settings?.ai && typeof settings.ai === 'object' ? (settings.ai as Record<string, unknown>) : null
  const baseUrl = (ai?.baseUrl as string)?.trim?.()
  const model = (ai?.model as string)?.trim?.()
  const apiKey = (ai?.apiKey as string)?.trim?.()
  if (!baseUrl || !model || !apiKey) {
    return c.json({ ok: false, error: 'AI 未配置', code: 'AI_NOT_CONFIGURED' }, 400)
  }
  const body = await c.req.json<{ messages?: Array<{ role: string; content: string }> }>().catch(() => ({}))
  const messages = body.messages
  if (!Array.isArray(messages) || messages.length === 0) {
    return c.json({ ok: false, error: 'Missing messages' }, 400)
  }
  const url = baseUrl.replace(/\/$/, '') + '/chat/completions'
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const errMsg = (data as { error?: { message?: string } })?.error?.message ?? res.statusText
      return c.json({ ok: false, error: errMsg }, res.status >= 400 ? res.status : 502)
    }
    const choices = (data as { choices?: unknown[] })?.choices
    const text = choices?.[0] && typeof choices[0] === 'object' && choices[0] !== null && 'message' in choices[0]
      ? ((choices[0] as { message?: { content?: string } }).message?.content ?? '')
      : ''
    return c.json({ ok: true, message: text, raw: data })
  } catch (e) {
    return c.json({ ok: false, error: String(e) }, 502)
  }
})

export const onRequest = handle(app)
