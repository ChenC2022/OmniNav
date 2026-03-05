import router from '@/router'

/**
 * 带鉴权感知的 fetch：自动携带 Cookie，收到 401 时跳转登录页（会话过期）。
 * 所有会返回 401 的敏感接口应使用此封装。
 */
export async function apiFetch(url: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, { ...init, credentials: 'include' })
  if (res.status === 401) {
    const path = router.currentRoute.value?.fullPath ?? window.location.pathname + window.location.search
    const isLoginPage = path === '/login' || path.startsWith('/login?')
    if (!isLoginPage) {
      router.push({ path: '/login', query: { redirect: path } })
    }
  }
  return res
}
