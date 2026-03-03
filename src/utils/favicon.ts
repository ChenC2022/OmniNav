/**
 * 构建 favicon URL，优先使用后端代理（Google S2），失败时有 fallback。
 * 前端 BookmarkIcon 在 img @error 时会切换到 fallback URL 或字母占位。
 */
export function faviconUrl(url: string, size = 32): string {
  const encoded = encodeURIComponent(url.startsWith('http') ? url : `https://${url}`)
  return `/api/favicon?url=${encoded}&sz=${Math.min(128, Math.max(16, size))}`
}

export function faviconFallbackUrl(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    return `${u.origin}/favicon.ico`
  } catch {
    return ''
  }
}
