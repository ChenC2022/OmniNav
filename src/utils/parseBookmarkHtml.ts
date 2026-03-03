/**
 * 解析 Chrome / Edge / Firefox 等导出的书签 HTML（Netscape Bookmark File Format）。
 * 提取所有 <A HREF="...">标题</A> 形式的链接，返回 { title, url } 列表。
 */
export interface ParsedBookmarkItem {
  title: string
  url: string
}

export function parseBookmarkHtml(html: string): ParsedBookmarkItem[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const links = doc.querySelectorAll<HTMLAnchorElement>('a[href]')
  const result: ParsedBookmarkItem[] = []
  const seen = new Set<string>()

  for (const a of links) {
    const href = (a.getAttribute('href') ?? '').trim()
    if (!href || href.startsWith('place:') || href.startsWith('javascript:')) continue
    const title = (a.textContent ?? a.innerText ?? '').trim() || href
    const key = `${href}\t${title}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push({ title, url: href })
  }

  return result
}
