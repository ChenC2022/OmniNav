/**
 * 解析 / 生成 Netscape Bookmark File Format（Chrome / Edge / Firefox 通用）。
 */

// ─── 扁平解析（保留，Home.vue 未分类区导入使用） ───

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

// ─── 带分类层级解析（设置页导入使用） ───

export interface ParsedFolder {
  name: string
  bookmarks: ParsedBookmarkItem[]
}

/**
 * 解析带文件夹层级的书签 HTML。
 * 顶层 <DL> 中的 <H3> 视为分类，其下 <A> 为该分类书签。
 * 嵌套文件夹会被扁平化（子文件夹名拼接到父级，如 "开发/前端"）。
 * 不在任何文件夹下的书签归入 folderName = ''。
 */
export function parseBookmarkHtmlWithFolders(html: string): ParsedFolder[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const folderMap = new Map<string, ParsedBookmarkItem[]>()
  const seen = new Set<string>()

  function ensureFolder(name: string): ParsedBookmarkItem[] {
    let list = folderMap.get(name)
    if (!list) {
      list = []
      folderMap.set(name, list)
    }
    return list
  }

  function addLink(folderName: string, a: HTMLAnchorElement) {
    const href = (a.getAttribute('href') ?? '').trim()
    if (!href || href.startsWith('place:') || href.startsWith('javascript:')) return
    const title = (a.textContent ?? a.innerText ?? '').trim() || href
    const key = `${href}\t${title}`
    if (seen.has(key)) return
    seen.add(key)
    ensureFolder(folderName).push({ title, url: href })
  }

  function walkDL(dl: Element, parentPath: string) {
    let currentFolder = parentPath

    for (const child of dl.children) {
      if (child.tagName !== 'DT') continue

      const h3 = child.querySelector(':scope > H3')
      if (h3) {
        const folderName = (h3.textContent ?? '').trim()
        if (!folderName) continue
        const fullPath = parentPath ? `${parentPath}/${folderName}` : folderName
        const nestedDL = child.querySelector(':scope > DL')
        if (nestedDL) {
          walkDL(nestedDL, fullPath)
        }
        continue
      }

      const a = child.querySelector(':scope > A')
      if (a) {
        addLink(currentFolder, a as HTMLAnchorElement)
      }
    }
  }

  const topDLs = doc.querySelectorAll('DL')
  if (topDLs.length > 0) {
    walkDL(topDLs[0]!, '')
  }

  const result: ParsedFolder[] = []
  for (const [name, bookmarks] of folderMap) {
    if (bookmarks.length > 0) {
      result.push({ name, bookmarks })
    }
  }
  return result
}

// ─── 导出为 Netscape Bookmark HTML ───

interface ExportCategory {
  name: string
}

interface ExportBookmark {
  title: string
  url: string
  categoryId: string
}

/**
 * 将 OmniNav 的分类与书签导出为标准 Netscape Bookmark HTML。
 * 可直接导入 Chrome / Edge / Firefox。
 */
export function buildBookmarkHtml(
  categories: ExportCategory[],
  bookmarks: ExportBookmark[],
  categoryIdMap: Map<string, string>,
): string {
  const esc = (s: string) => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

  const grouped = new Map<string, ExportBookmark[]>()
  for (const b of bookmarks) {
    const catName = categoryIdMap.get(b.categoryId) ?? ''
    let list = grouped.get(catName)
    if (!list) {
      list = []
      grouped.set(catName, list)
    }
    list.push(b)
  }

  const lines: string[] = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- This is an automatically generated file by OmniNav. -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>OmniNav Bookmarks</TITLE>',
    '<H1>OmniNav Bookmarks</H1>',
    '<DL><p>',
  ]

  for (const cat of categories) {
    const list = grouped.get(cat.name)
    if (!list || list.length === 0) continue
    lines.push(`    <DT><H3>${esc(cat.name)}</H3>`)
    lines.push('    <DL><p>')
    for (const b of list) {
      lines.push(`        <DT><A HREF="${esc(b.url)}">${esc(b.title)}</A>`)
    }
    lines.push('    </DL><p>')
    grouped.delete(cat.name)
  }

  const uncategorized = grouped.get('') ?? []
  for (const [name, list] of grouped) {
    if (name === '') continue
    if (list.length === 0) continue
    lines.push(`    <DT><H3>${esc(name)}</H3>`)
    lines.push('    <DL><p>')
    for (const b of list) {
      lines.push(`        <DT><A HREF="${esc(b.url)}">${esc(b.title)}</A>`)
    }
    lines.push('    </DL><p>')
  }

  if (uncategorized.length > 0) {
    for (const b of uncategorized) {
      lines.push(`    <DT><A HREF="${esc(b.url)}">${esc(b.title)}</A>`)
    }
  }

  lines.push('</DL><p>')
  return lines.join('\n')
}
