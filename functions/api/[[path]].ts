import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'

type Bindings = {
  KV_OMNINAV: KVNamespace
  OMNINAV_OWNER_PASSWORD?: string
}

const app = new Hono<{ Bindings: Bindings }>().basePath('/api')

const SESSION_COOKIE_NAME = 'omninav_session'
const SESSION_TTL = 604800 // 7 天
const AUTH_PUBLIC_PATHS = ['/api/auth/login', '/api/auth/status', '/api/auth/initial-setup', '/api/favicon', '/api/weather', '/api/geocode', '/api/reverse-geocode']
const KV_AUTH_PASSWORD_HASH = 'auth:password_hash'
const KV_AUTH_FIRST_LOGIN_DONE = 'auth:first_login_done'

async function hashPassword(pwd: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pwd))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function parseSessionId(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null
  const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`))
  return match ? match[1].trim() : null
}

async function requireAuth(
  c: { req: Request; env: Bindings; json: (body: object, status?: number) => Response },
  next: () => Promise<Response>
): Promise<Response> {
  const path = new URL(c.req.url).pathname
  if (AUTH_PUBLIC_PATHS.includes(path)) return next()
  const cookieHeader = c.req.header('Cookie')
  const sessionId = parseSessionId(cookieHeader)

  // Debug logging
  console.log(`[Auth Debug] Path: ${path}, SessionId: ${sessionId ? 'exists' : 'null'}, CookieHeader: ${cookieHeader ? 'present' : 'absent'}`)

  if (!sessionId) return c.json({ ok: false, error: 'Unauthorized' }, 401)
  const kv = c.env.KV_OMNINAV
  if (!kv) return c.json({ ok: false, error: 'KV not available' }, 503)
  const valid = await kv.get(`session:${sessionId}`)
  if (!valid) {
    console.log(`[Auth Debug] Invalid or expired SessionId: ${sessionId}`)
    return c.json({ ok: false, error: 'Unauthorized' }, 401)
  }
  return next()
}

/** 从 KV 读取 key 并解析为 JSON，缺失或非法时返回 null */
async function getJson<T>(kv: KVNamespace, key: string): Promise<T | null> {
  const raw = await kv.get(key)
  if (raw == null) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

// ---------- SSRF 防护：禁止内网与元数据地址 ----------
function isUrlAllowed(url: URL): boolean {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  const host = url.hostname.toLowerCase()
  if (host === 'localhost' || host === '::1' || host === '0.0.0.0' || host === '127.0.0.1' || host === '169.254.169.254') return false
  if (/^10\.\d+\.\d+\.\d+$/.test(host)) return false
  if (/^192\.168\.\d+\.\d+$/.test(host)) return false
  if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host)) return false
  if (host.startsWith('fe80:') || host === '::1') return false
  return true
}

// ---------- 公开路由（无需鉴权） ----------

const LOGIN_RATE_LIMIT_WINDOW = 60 // 秒
const LOGIN_RATE_LIMIT_MAX = 5

// GET /api/auth/status（公开，用于判断是否需要首次设密）
app.get('/auth/status', async (c) => {
  const kv = c.env.KV_OMNINAV
  if (!kv) return c.json({ ok: false, needInitialSetup: false }, 503)
  const storedHash = await kv.get(KV_AUTH_PASSWORD_HASH)
  const envPassword = c.env.OMNINAV_OWNER_PASSWORD
  const needInitialSetup = !storedHash && !envPassword
  return c.json({ ok: true, needInitialSetup })
})

// POST /api/auth/initial-setup（公开，首次访问者设密，仅当 KV 无密码时可用）
app.post('/auth/initial-setup', async (c) => {
  const kv = c.env.KV_OMNINAV
  if (!kv) return c.json({ ok: false, error: 'KV not available' }, 503)
  const storedHash = await kv.get(KV_AUTH_PASSWORD_HASH)
  if (storedHash) return c.json({ ok: false, error: 'Password already configured' }, 400)
  const envPassword = c.env.OMNINAV_OWNER_PASSWORD
  if (envPassword) return c.json({ ok: false, error: 'Use deployment password to login first' }, 400)
  const ip = c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ?? 'unknown'
  const rateKey = `ratelimit:initial-setup:${ip}`
  const current = await kv.get(rateKey)
  const count = current ? parseInt(current, 10) : 0
  if (count >= LOGIN_RATE_LIMIT_MAX) {
    return c.json({ ok: false, error: 'Too many attempts' }, 429)
  }
  const body = await c.req.json<{ newPassword?: string }>().catch(() => ({}))
  const newPwd = typeof body?.newPassword === 'string' ? body.newPassword : ''
  if (!newPwd || newPwd.length < 4) {
    await kv.put(rateKey, String(count + 1), { expirationTtl: LOGIN_RATE_LIMIT_WINDOW })
    return c.json({ ok: false, error: '新密码至少 4 位' }, 400)
  }
  await kv.delete(rateKey).catch(() => { })
  const newHash = await hashPassword(newPwd)
  await kv.put(KV_AUTH_PASSWORD_HASH, newHash)
  await kv.put(KV_AUTH_FIRST_LOGIN_DONE, '1')
  const sessionId = crypto.randomUUID()
  await kv.put(`session:${sessionId}`, '1', { expirationTtl: SESSION_TTL })
  const hostname = new URL(c.req.url).hostname.toLowerCase()
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  const cookieOptions = `; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL}${isLocalhost ? '' : '; Secure'}`
  const cookie = `${SESSION_COOKIE_NAME}=${sessionId}${cookieOptions}`

  console.log(`[Auth Debug] Initial Setup. Hostname: ${hostname}, IsLocalhost: ${isLocalhost}, Cookie: ${cookie}`)

  c.header('Set-Cookie', cookie)
  return c.json({ ok: true })
})

// POST /api/auth/login
app.post('/auth/login', async (c) => {
  const kv = c.env.KV_OMNINAV
  if (!kv) return c.json({ ok: false, error: 'KV not available' }, 503)
  const storedHash = await kv.get(KV_AUTH_PASSWORD_HASH)
  const envPassword = c.env.OMNINAV_OWNER_PASSWORD
  if (!storedHash && !envPassword) {
    return c.json({ ok: false, needInitialSetup: true }, 400)
  }
  const ip = c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ?? 'unknown'
  const rateKey = `ratelimit:login:${ip}`
  const current = await kv.get(rateKey)
  const count = current ? parseInt(current, 10) : 0
  if (count >= LOGIN_RATE_LIMIT_MAX) {
    return c.json({ ok: false, error: 'Too many attempts' }, 429)
  }
  const body = await c.req.json<{ password?: string }>().catch(() => ({}))
  const submitted = typeof body?.password === 'string' ? body.password : ''
  let valid = false
  if (storedHash) {
    const submittedHash = await hashPassword(submitted)
    valid = submittedHash === storedHash
  } else {
    valid = envPassword ? submitted === envPassword : false
  }
  if (!valid) {
    await kv.put(rateKey, String(count + 1), { expirationTtl: LOGIN_RATE_LIMIT_WINDOW })
    return c.json({ ok: false, error: 'Invalid password' }, 401)
  }
  await kv.delete(rateKey).catch(() => { })
  const sessionId = crypto.randomUUID()
  await kv.put(`session:${sessionId}`, '1', { expirationTtl: SESSION_TTL })
  const hostname = new URL(c.req.url).hostname.toLowerCase()
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  const cookieOptions = `; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL}${isLocalhost ? '' : '; Secure'}`
  const cookie = `${SESSION_COOKIE_NAME}=${sessionId}${cookieOptions}`

  console.log(`[Auth Debug] Login. Hostname: ${hostname}, IsLocalhost: ${isLocalhost}, Cookie: ${cookie}`)

  c.header('Set-Cookie', cookie)
  const firstLoginDone = await kv.get(KV_AUTH_FIRST_LOGIN_DONE)
  return c.json(firstLoginDone ? { ok: true } : { ok: true, firstLogin: true })
})

// GET /api/favicon（公开，未登录也可用）
const FAVICON_TIMEOUT_MS = 4000
/** 请求站点时使用浏览器 UA，避免 Cloudflare 等返回挑战页导致拿不到真实 HTML/图标 */
const FAVICON_BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
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

/**
 * 从 HTML 中解析 <link rel="icon"> / <link rel="shortcut icon"> 的 href，
 * 优先选择带 sizes 32 或 16 的，相对路径按 baseUrl 解析为绝对 URL。
 */
function parseFaviconFromHtml(html: string, baseUrl: string): string | null {
  const iconCandidates: { href: string; priority: number }[] = []
  const linkRe = /<link\s[^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(html)) !== null) {
    const tag = m[0]
    const relMatch = tag.match(/\brel\s*=\s*["']([^"']*)["']/i)
    const hrefMatch = tag.match(/\bhref\s*=\s*["']([^"']*)["']/i)
    if (!relMatch || !hrefMatch) continue
    const rel = relMatch[1].toLowerCase()
    if (!rel.includes('icon')) continue
    const href = hrefMatch[1].trim()
    if (!href || href.startsWith('data:')) continue
    let priority = 0
    const sizesMatch = tag.match(/\bsizes\s*=\s*["']([^"']*)["']/i)
    if (sizesMatch) {
      const s = sizesMatch[1]
      if (s.includes('32')) priority = 2
      else if (s.includes('16')) priority = 1
    } else {
      priority = 1
    }
    iconCandidates.push({ href, priority })
  }
  if (iconCandidates.length === 0) return null
  iconCandidates.sort((a, b) => b.priority - a.priority)
  try {
    return new URL(iconCandidates[0].href, baseUrl).href
  } catch {
    return null
  }
}

app.get('/favicon', async (c) => {
  const raw = c.req.query('url')
  if (!raw || typeof raw !== 'string') return c.json({ ok: false, error: 'Missing url' }, 400)
  let domain: string
  let origin: string
  let pageUrl: string
  try {
    const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`)
    if (!isUrlAllowed(u)) return c.json({ ok: false, error: 'URL not allowed' }, 400)
    domain = u.hostname
    origin = u.origin
    pageUrl = u.href
  } catch {
    return c.json({ ok: false, error: 'Invalid url' }, 400)
  }
  const size = Math.min(128, Math.max(16, Number(c.req.query('sz')) || 32))
  const headers = { 'User-Agent': 'OmniNav/1' }
  const siteHeaders = { 'User-Agent': FAVICON_BROWSER_UA }
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
  for (const path of ['/favicon.ico', '/apple-touch-icon.png']) {
    try {
      const res = await fetchWithTimeout(`${origin}${path}`, { headers: siteHeaders })
      if (res.ok) {
        const blob = await res.arrayBuffer()
        const contentType = res.headers.get('Content-Type') || (path.endsWith('.ico') ? 'image/x-icon' : 'image/png')
        return new Response(blob, { headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=86400' } })
      }
    } catch {
      /* 尝试下一路径 */
    }
  }
  try {
    const pageRes = await fetchWithTimeout(pageUrl, { headers: siteHeaders })
    if (!pageRes.ok) throw new Error('Page fetch failed')
    const html = await pageRes.text()
    const iconUrl = parseFaviconFromHtml(html, pageUrl)
    if (iconUrl) {
      const iconUrlObj = new URL(iconUrl)
      if (!isUrlAllowed(iconUrlObj)) throw new Error('Favicon URL not allowed')
      const iconRes = await fetchWithTimeout(iconUrl, { headers: siteHeaders })
      if (iconRes.ok) {
        const blob = await iconRes.arrayBuffer()
        const contentType = iconRes.headers.get('Content-Type') || 'image/png'
        return new Response(blob, { headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=86400' } })
      }
    }
  } catch {
    /* 尝试主域名 fallback（如 dash.domain.digitalplat.org -> domain.digitalplat.org） */
  }
  const parts = domain.split('.')
  if (parts.length >= 3) {
    const parentDomain = parts.slice(1).join('.')
    const parentOrigin = `${new URL(origin).protocol}//${parentDomain}`
    try {
      const parentGoogleUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parentDomain)}&sz=${size}`
      const res = await fetchWithTimeout(parentGoogleUrl, { headers })
      if (res.ok) {
        const blob = await res.arrayBuffer()
        const contentType = res.headers.get('Content-Type') || 'image/x-icon'
        return new Response(blob, { headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=86400' } })
      }
    } catch {
      /* 继续试主域名静态路径 */
    }
    for (const path of ['/favicon.ico', '/apple-touch-icon.png']) {
      try {
        const res = await fetchWithTimeout(`${parentOrigin}${path}`, { headers: siteHeaders })
        if (res.ok) {
          const blob = await res.arrayBuffer()
          const contentType = res.headers.get('Content-Type') || (path.endsWith('.ico') ? 'image/x-icon' : 'image/png')
          return new Response(blob, { headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=86400' } })
        }
      } catch {
        /* 下一路径 */
      }
    }
  }
  const transparent1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  return new Response(Uint8Array.from(atob(transparent1x1), (c) => c.charCodeAt(0)), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' },
  })
})

// GET /api/weather、geocode、reverse-geocode（公开）
app.get('/weather', async (c) => {
  const lat = c.req.query('lat')
  const lon = c.req.query('lon')
  const latitude = lat ? Number(lat) : 39.9
  const longitude = lon ? Number(lon) : 116.4
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return c.json({ ok: false, error: 'Invalid lat/lon' }, 400)
  }

  const TTL_SECONDS = 15 * 60
  const latKey = Number(latitude.toFixed(3))
  const lonKey = Number(longitude.toFixed(3))
  const cacheKeyUrl = new URL(c.req.url)
  cacheKeyUrl.searchParams.set('lat', String(latKey))
  cacheKeyUrl.searchParams.set('lon', String(lonKey))
  const cacheKey = new Request(cacheKeyUrl.toString(), { method: 'GET' })

  // 1) Edge Cache API
  try {
    const cached = await caches.default.match(cacheKey)
    if (cached) return cached
  } catch {
    /* ignore cache errors */
  }

  // 2) KV 缓存（可选，bindings 不存在时跳过）
  const kv = c.env.KV_OMNINAV
  const kvKey = `weather:${latKey}:${lonKey}`
  if (kv) {
    try {
      const cachedJson = await kv.get(kvKey, 'text')
      if (cachedJson) {
        const res = new Response(cachedJson, {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': `public, max-age=0, s-maxage=${TTL_SECONDS}`,
          },
        })
        try { await caches.default.put(cacheKey, res.clone()) } catch { /* ignore */ }
        return res
      }
    } catch {
      /* ignore kv errors */
    }
  }

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latKey}&longitude=${lonKey}&current=temperature_2m,weather_code&timezone=auto`

  function mapWeather(code: number | null): { text: string; icon: string } {
    if (code == null || Number.isNaN(code)) return { text: '未知', icon: 'help' }
    // Open-Meteo WMO weather codes (subset)
    if (code === 0) return { text: '晴', icon: 'sunny' }
    if (code === 1) return { text: '大部晴朗', icon: 'partly_cloudy_day' }
    if (code === 2) return { text: '多云', icon: 'cloud' }
    if (code === 3) return { text: '阴', icon: 'cloud' }
    if (code === 45 || code === 48) return { text: '雾', icon: 'foggy' }
    if ([51, 53, 55].includes(code)) return { text: '毛毛雨', icon: 'rainy' }
    if ([56, 57].includes(code)) return { text: '冻雨', icon: 'ac_unit' }
    if ([61, 63, 65].includes(code)) return { text: '雨', icon: 'rainy' }
    if ([66, 67].includes(code)) return { text: '冻雨', icon: 'ac_unit' }
    if ([71, 73, 75].includes(code)) return { text: '雪', icon: 'weather_snowy' }
    if (code === 77) return { text: '雪粒', icon: 'weather_snowy' }
    if ([80, 81, 82].includes(code)) return { text: '阵雨', icon: 'rainy' }
    if ([85, 86].includes(code)) return { text: '阵雪', icon: 'weather_snowy' }
    if (code === 95) return { text: '雷暴', icon: 'thunderstorm' }
    if (code === 96 || code === 99) return { text: '雷暴冰雹', icon: 'thunderstorm' }
    return { text: '多云', icon: 'cloud' }
  }

  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'OmniNav/1' } })
    if (!res.ok) return c.json({ ok: false, error: 'Weather fetch failed' }, 502)
    const data = await res.json() as { current?: { temperature_2m?: number; weather_code?: number } }
    const temp = data.current?.temperature_2m ?? null
    const code = data.current?.weather_code ?? null
    const mapped = mapWeather(typeof code === 'number' ? code : null)
    const body = JSON.stringify({
      ok: true,
      temp,
      code,
      text: mapped.text,
      icon: mapped.icon,
      source: 'open-meteo',
      cachedForSeconds: TTL_SECONDS,
      at: new Date().toISOString(),
    })
    const out = new Response(body, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=0, s-maxage=${TTL_SECONDS}`,
      },
    })
    if (kv) {
      kv.put(kvKey, body, { expirationTtl: TTL_SECONDS }).catch(() => {})
    }
    try { await caches.default.put(cacheKey, out.clone()) } catch { /* ignore */ }
    return out
  } catch (e) {
    return c.json({ ok: false, error: String(e) }, 502)
  }
})
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

// ---------- 鉴权中间件：以下路由均需有效会话 ----------
app.use('*', requireAuth)

// GET /api/auth/me（方案 B 路由守卫用）
app.get('/auth/me', (c) => c.json({ ok: true }))

// POST /api/auth/logout
app.post('/auth/logout', async (c) => {
  const sessionId = parseSessionId(c.req.header('Cookie'))
  const kv = c.env.KV_OMNINAV
  if (sessionId && kv) await kv.delete(`session:${sessionId}`)
  const hostname = new URL(c.req.url).hostname.toLowerCase()
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  const clearCookie = `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${isLocalhost ? '' : '; Secure'}`
  c.header('Set-Cookie', clearCookie)
  return c.json({ ok: true })
})

// POST /api/auth/set-password（首次设置或修改密码，需已登录）
app.post('/auth/set-password', async (c) => {
  const kv = c.env.KV_OMNINAV
  if (!kv) return c.json({ ok: false, error: 'KV not available' }, 503)
  const envPassword = c.env.OMNINAV_OWNER_PASSWORD
  const body = await c.req.json<{ currentPassword?: string; newPassword?: string }>().catch(() => ({}))
  const current = typeof body?.currentPassword === 'string' ? body.currentPassword : ''
  const newPwd = typeof body?.newPassword === 'string' ? body.newPassword : ''
  if (!newPwd || newPwd.length < 4) return c.json({ ok: false, error: '新密码至少 4 位' }, 400)
  const storedHash = await kv.get(KV_AUTH_PASSWORD_HASH)
  let currentValid = false
  if (storedHash) {
    currentValid = (await hashPassword(current)) === storedHash
  } else {
    currentValid = envPassword ? current === envPassword : false
  }
  if (!currentValid) return c.json({ ok: false, error: '当前密码错误' }, 401)
  const newHash = await hashPassword(newPwd)
  await kv.put(KV_AUTH_PASSWORD_HASH, newHash)
  await kv.put(KV_AUTH_FIRST_LOGIN_DONE, '1')
  return c.json({ ok: true })
})

// POST /api/admin/reset-auth-state（仅用于测试：清除“已设置密码”状态，便于复现首次登录）
app.post('/admin/reset-auth-state', async (c) => {
  const kv = c.env.KV_OMNINAV
  if (!kv) return c.json({ ok: false, error: 'KV not available' }, 503)
  const envPassword = c.env.OMNINAV_OWNER_PASSWORD
  const body = await c.req.json<{ password?: string }>().catch(() => ({}))
  const pwd = typeof body?.password === 'string' ? body.password : ''
  const storedHash = await kv.get(KV_AUTH_PASSWORD_HASH)
  let valid = false
  if (storedHash) {
    valid = (await hashPassword(pwd)) === storedHash
  } else {
    valid = !!envPassword && pwd === envPassword
  }
  if (!valid) return c.json({ ok: false, error: '当前密码错误' }, 401)
  await kv.delete(KV_AUTH_PASSWORD_HASH)
  await kv.delete(KV_AUTH_FIRST_LOGIN_DONE)
  return c.json({ ok: true, message: '已重置，请退出登录后用「部署时配置的主人密码」再次登录以触发首次设置新密码。' })
})

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

// ─── 自动备份快照 API ───
// KV key 格式：backup:<YYYY-MM-DD>  值：{ bookmarks, categories, pinned, createdAt }
// 最多保留 MAX_BACKUPS 份，超出时自动删除最旧的

const MAX_BACKUPS = 7
const BACKUP_KEY_PREFIX = 'backup:'

interface BackupSnapshot {
  bookmarks: unknown[]
  categories: unknown[]
  pinned: string[]
  createdAt: string
}

// GET /api/data/backups — 列出所有快照（仅返回元数据，不含完整数据）
app.get('/data/backups', async (c) => {
  const kv = c.env.KV_OMNINAV
  if (!kv) return c.json({ ok: false, error: 'KV not available' }, 503)
  const list = await kv.list({ prefix: BACKUP_KEY_PREFIX })
  const items = list.keys.map((k) => ({
    key: k.name,
    date: k.name.replace(BACKUP_KEY_PREFIX, ''),
  })).sort((a, b) => b.date.localeCompare(a.date))
  return c.json({ ok: true, data: items })
})

// GET /api/data/backups/:date — 获取指定日期的快照完整数据
app.get('/data/backups/:date', async (c) => {
  const kv = c.env.KV_OMNINAV
  if (!kv) return c.json({ ok: false, error: 'KV not available' }, 503)
  const date = c.req.param('date')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ ok: false, error: 'Invalid date format' }, 400)
  const data = await getJson<BackupSnapshot>(kv, `${BACKUP_KEY_PREFIX}${date}`)
  if (!data) return c.json({ ok: false, error: 'Backup not found' }, 404)
  return c.json({ ok: true, data })
})

// POST /api/data/backups — 创建快照（前端每日调用一次）
app.post('/data/backups', async (c) => {
  const kv = c.env.KV_OMNINAV
  if (!kv) return c.json({ ok: false, error: 'KV not available' }, 503)

  const today = new Date().toISOString().slice(0, 10)
  const key = `${BACKUP_KEY_PREFIX}${today}`

  // 今天已有快照则跳过（幂等）
  const existing = await kv.get(key)
  if (existing) return c.json({ ok: true, skipped: true, date: today })

  const [bookmarks, categories, pinned] = await Promise.all([
    getJson<unknown[]>(kv, 'bookmarks'),
    getJson<unknown[]>(kv, 'categories'),
    getJson<string[]>(kv, 'pinned'),
  ])

  const snapshot: BackupSnapshot = {
    bookmarks: bookmarks ?? [],
    categories: categories ?? [],
    pinned: pinned ?? [],
    createdAt: new Date().toISOString(),
  }

  await kv.put(key, JSON.stringify(snapshot))

  // 超出上限时删除最旧的快照
  const list = await kv.list({ prefix: BACKUP_KEY_PREFIX })
  const allKeys = list.keys.map((k) => k.name).sort()
  if (allKeys.length > MAX_BACKUPS) {
    const toDelete = allKeys.slice(0, allKeys.length - MAX_BACKUPS)
    await Promise.all(toDelete.map((k) => kv.delete(k)))
  }

  return c.json({ ok: true, skipped: false, date: today })
})

// DELETE /api/data/backups/:date — 删除指定快照
app.delete('/data/backups/:date', async (c) => {
  const kv = c.env.KV_OMNINAV
  if (!kv) return c.json({ ok: false, error: 'KV not available' }, 503)
  const date = c.req.param('date')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ ok: false, error: 'Invalid date format' }, 400)
  await kv.delete(`${BACKUP_KEY_PREFIX}${date}`)
  return c.json({ ok: true })
})

// GET /api/data/snapshot（扩展专用：一次鉴权并发读取 bookmarks/categories/pinned，减少跨境 RTT）
app.get('/data/snapshot', async (c) => {
  const kv = c.env.KV_OMNINAV
  if (!kv) return c.json({ ok: false, error: 'KV not available' }, 503)
  const [bookmarks, categories, pinned] = await Promise.all([
    getJson<unknown[]>(kv, 'bookmarks'),
    getJson<unknown[]>(kv, 'categories'),
    getJson<string[]>(kv, 'pinned'),
  ])
  return c.json({
    ok: true,
    data: {
      bookmarks: bookmarks ?? [],
      categories: categories ?? [],
      pinned: pinned ?? [],
    },
  })
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

// POST /api/extract-meta Body: { "url": "https://..." } → 抓取页面 title + meta description，用于自动归类深度分析
const EXTRACT_META_TIMEOUT_MS = 10000
app.post('/extract-meta', async (c) => {
  const body = await c.req.json<{ url?: string }>().catch(() => ({}))
  const rawUrl = body?.url
  if (!rawUrl || typeof rawUrl !== 'string') return c.json({ ok: false, error: 'Missing url' }, 400)
  let url: string
  try {
    const u = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`)
    if (!isUrlAllowed(u)) return c.json({ ok: false, error: 'URL not allowed' }, 400)
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
  const rawUrl = body?.url
  if (!rawUrl || typeof rawUrl !== 'string') return c.json({ ok: false, error: 'Missing url' }, 400)
  let url: string
  try {
    const u = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`)
    if (!isUrlAllowed(u)) return c.json({ ok: false, error: 'URL not allowed' }, 400)
    url = u.href
  } catch {
    return c.json({ ok: false, error: 'Invalid url' }, 400)
  }
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

// 书签/分类类型（仅取 AI 上下文所需字段）
interface BookmarkForContext {
  id?: string
  title?: string
  url?: string
  description?: string
  categoryId?: string
  order?: number
}
interface CategoryForContext {
  id?: string
  name?: string
  description?: string
  order?: number
}

/** 构建「书签检索助手」系统提示：包含全部分类与书签（名称+说明），无条数/长度上限 */
function buildBookmarkContextSystemPrompt(
  bookmarks: BookmarkForContext[],
  categories: CategoryForContext[]
): string {
  const intro =
    '你是用户的书签检索助手，可以根据下方书签信息回答检索、推荐、归类等问题；你也可以正常聊天或回答一般问题。\n\n【书签与分类】\n\n'
  if (!bookmarks.length && !categories.length) {
    return intro + '（用户暂无书签与分类）'
  }
  const catMap = new Map<string, CategoryForContext>()
  for (const cat of categories) {
    if (cat?.id != null) catMap.set(String(cat.id), cat)
  }
  const byCat = new Map<string, BookmarkForContext[]>()
  for (const b of bookmarks) {
    if (!b || b.categoryId == null) continue
    const list = byCat.get(b.categoryId) ?? []
    list.push(b)
    byCat.set(b.categoryId, list)
  }
  const sortedCats = [...categories].filter((c) => c && c.id != null).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const lines: string[] = []
  for (const cat of sortedCats) {
    const id = String(cat.id)
    const name = cat.name ?? '未命名分类'
    const desc = cat.description?.trim()
    lines.push(`## ${name}${desc ? `\n说明：${desc}` : ''}`)
    const list = byCat.get(id) ?? []
    list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    for (const b of list) {
      const title = b.title?.trim() || '(无标题)'
      const url = b.url?.trim() || ''
      const bDesc = b.description?.trim()
      lines.push(`- ${title} | ${url}${bDesc ? ` | ${bDesc}` : ''}`)
    }
    lines.push('')
  }
  const uncat = bookmarks.filter((b) => b && (b.categoryId == null || !catMap.has(String(b.categoryId))))
  if (uncat.length) {
    uncat.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    lines.push('## 未分类')
    for (const b of uncat) {
      const title = b.title?.trim() || '(无标题)'
      const url = b.url?.trim() || ''
      const bDesc = b.description?.trim()
      lines.push(`- ${title} | ${url}${bDesc ? ` | ${bDesc}` : ''}`)
    }
  }
  return intro + lines.join('\n').trimEnd()
}

// POST /api/ai/chat：从 KV 读取 AI 配置与书签/分类，注入系统上下文后转发 OpenAI 兼容接口（非流式），并返回 usage
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

  const [bookmarksJson, categoriesJson] = await Promise.all([
    getJson<BookmarkForContext[]>(kv, 'bookmarks'),
    getJson<CategoryForContext[]>(kv, 'categories'),
  ])
  const bookmarks = Array.isArray(bookmarksJson) ? bookmarksJson : []
  const categories = Array.isArray(categoriesJson) ? categoriesJson : []
  const systemContent = buildBookmarkContextSystemPrompt(bookmarks, categories)
  const messagesWithSystem = [
    { role: 'system' as const, content: systemContent },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ]

  const url = baseUrl.replace(/\/$/, '') + '/chat/completions'
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages: messagesWithSystem }),
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
    const usage = (data as { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } })
      ?.usage
    return c.json({
      ok: true,
      message: text,
      usage: usage ?? undefined,
      raw: data,
    })
  } catch (e) {
    return c.json({ ok: false, error: String(e) }, 502)
  }
})

// POST /api/ai/classify：根据书签标题+URL，从现有分类中推荐最合适的 categoryId
app.post('/ai/classify', async (c) => {
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

  const body = await c.req.json<{ title?: string; url?: string; categories?: { id: string; name: string }[] }>().catch(() => ({}))
  const { title = '', url = '', categories = [] } = body

  if (!categories.length) {
    return c.json({ ok: true, categoryId: null, reason: '无可用分类' })
  }

  const catList = categories.map((cat, i) => `${i + 1}. id="${cat.id}" name="${cat.name}"`).join('\n')
  const prompt = `你是一个书签分类助手。请根据书签信息，从下列分类中选出最合适的一个，只返回该分类的 id，不要解释。

书签标题：${title}
书签URL：${url}

可选分类列表：
${catList}

请直接返回最合适的分类 id（字符串），如果没有合适的分类就返回 "uncategorized"。`

  const aiUrl = baseUrl.replace(/\/$/, '') + '/chat/completions'
  try {
    const res = await fetch(aiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 64,
        temperature: 0,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const errMsg = (data as { error?: { message?: string } })?.error?.message ?? res.statusText
      return c.json({ ok: false, error: errMsg }, 502)
    }
    const raw = (data as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content?.trim() ?? ''
    // 校验返回的 id 确实在分类列表中
    const matched = categories.find((cat) => cat.id === raw)
    return c.json({ ok: true, categoryId: matched ? matched.id : null, raw })
  } catch (e) {
    return c.json({ ok: false, error: String(e) }, 502)
  }
})

// POST /api/ext/bookmarks：增量添加单条书签（后端负责读-去重-追加-写，避免客户端全量覆盖竞争）
app.post('/ext/bookmarks', async (c) => {
  const kv = c.env.KV_OMNINAV
  if (!kv) return c.json({ ok: false, error: 'KV not available' }, 503)

  type NewBookmark = {
    id?: string
    title?: string
    url?: string
    description?: string
    categoryId?: string
    order?: number
  }

  const body = await c.req.json<NewBookmark>().catch(() => null)
  if (!body || typeof body.url !== 'string' || !body.url.trim()) {
    return c.json({ ok: false, error: 'url 为必填字段' }, 400)
  }

  const url = body.url.trim()
  const existing = await getJson<NewBookmark[]>(kv, 'bookmarks') ?? []

  // URL 去重
  if (existing.some((b) => b.url === url)) {
    return c.json({ ok: false, error: '该链接已存在', code: 'DUPLICATE' }, 409)
  }

  const newBookmark: NewBookmark = {
    id: body.id ?? crypto.randomUUID(),
    title: (body.title ?? '').trim() || url,
    url,
    description: body.description ?? '',
    categoryId: body.categoryId ?? 'uncategorized',
    order: body.order ?? existing.length,
  }

  await kv.put('bookmarks', JSON.stringify([...existing, newBookmark]))
  return c.json({ ok: true, data: newBookmark })
})

export const onRequest = handle(app)
