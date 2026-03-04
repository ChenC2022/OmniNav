/**
 * 解析 Sun-Panel 导出的 JSON 配置文件。
 *
 * 实际格式（v1.7.0）：
 * {
 *   "version": 1,
 *   "appName": "Sun-Panel-Config",
 *   "appVersion": "1.7.0",
 *   "icons": [
 *     {
 *       "title": "分组名",
 *       "sort": 2,
 *       "children": [
 *         { "title": "标题", "url": "https://...", "description": "...", "sort": 0, ... }
 *       ]
 *     }
 *   ]
 * }
 *
 * 每个 icons 元素是一个分组，children 是该分组下的书签卡片。
 */

export interface SunPanelGroup {
  name: string
  sort: number
}

export interface SunPanelItem {
  title: string
  url: string
  description: string
  groupName: string
  sort: number
}

export interface SunPanelParseResult {
  groups: SunPanelGroup[]
  items: SunPanelItem[]
}

function str(v: unknown): string {
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number') return String(v)
  return ''
}

function num(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return v
  if (typeof v === 'string') {
    const n = Number(v)
    if (!Number.isNaN(n)) return n
  }
  return fallback
}

function pickUrl(o: Record<string, unknown>): string {
  for (const k of ['url', 'Url', 'URL', 'openUrl', 'OpenUrl', 'open_url', 'href', 'lanUrl']) {
    const v = o[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

function parseNestedFormat(icons: unknown[]): SunPanelParseResult | null {
  const groups: SunPanelGroup[] = []
  const items: SunPanelItem[] = []

  for (const group of icons) {
    if (!group || typeof group !== 'object') continue
    const g = group as Record<string, unknown>
    const groupName = str(g.title ?? g.name ?? g.Title ?? g.Name ?? '')
    const groupSort = num(g.sort ?? g.Sort ?? g.order ?? g.Order)
    const children = g.children ?? g.Children ?? g.items ?? g.Items

    if (!Array.isArray(children) || children.length === 0) continue

    groups.push({ name: groupName || '未命名分组', sort: groupSort })

    for (const child of children) {
      if (!child || typeof child !== 'object') continue
      const c = child as Record<string, unknown>
      const url = pickUrl(c)
      if (!url) continue
      const title = str(c.title ?? c.Title ?? c.name ?? c.Name ?? '') || url
      const description = str(c.description ?? c.Description ?? c.desc ?? c.Desc ?? '')
      items.push({
        title,
        url,
        description,
        groupName: groupName || '未命名分组',
        sort: num(c.sort ?? c.Sort ?? c.order ?? c.Order),
      })
    }
  }

  if (items.length === 0) return null
  return { groups: groups.sort((a, b) => a.sort - b.sort), items }
}

/**
 * 解析 Sun-Panel 导出的 JSON。
 * 返回 null 表示格式不匹配。
 */
export function parseSunPanelJson(json: unknown): SunPanelParseResult | null {
  if (!json || typeof json !== 'object') return null
  const obj = json as Record<string, unknown>

  const icons = obj.icons ?? obj.Icons
  if (Array.isArray(icons) && icons.length > 0) {
    const first = icons[0]
    if (first && typeof first === 'object' && 'children' in (first as object)) {
      return parseNestedFormat(icons)
    }
  }

  // 兼容旧版扁平格式（itemIconGroupList + itemIconList）
  const rawGroups = (obj.itemIconGroupList ?? obj.ItemIconGroupList ?? obj.groups ?? obj.Groups) as unknown[] | undefined
  const rawItems = (obj.itemIconList ?? obj.ItemIconList ?? obj.items ?? obj.Items ?? icons) as unknown[] | undefined

  if (!Array.isArray(rawItems) || rawItems.length === 0) return null

  const groupIdToName = new Map<string | number, string>()
  if (Array.isArray(rawGroups)) {
    for (const g of rawGroups) {
      if (!g || typeof g !== 'object') continue
      const o = g as Record<string, unknown>
      const id = o.id ?? o.ID ?? o.Id
      const name = str(o.title ?? o.Title ?? o.name ?? o.Name ?? o.groupName ?? o.GroupName ?? '')
      if (id != null && name) {
        groupIdToName.set(typeof id === 'number' ? id : str(id), name)
      }
    }
  }

  const groups: SunPanelGroup[] = []
  const seenGroups = new Set<string>()
  const items: SunPanelItem[] = []

  for (const item of rawItems) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const url = pickUrl(o)
    if (!url) continue

    const title = str(o.title ?? o.Title ?? o.name ?? o.Name ?? '') || url
    const description = str(o.description ?? o.Description ?? o.desc ?? o.Desc ?? '')
    const groupId = o.groupId ?? o.GroupId ?? o.group_id ?? o.groupID ?? o.itemIconGroupId ?? o.ItemIconGroupId
    const groupName = groupId != null ? (groupIdToName.get(typeof groupId === 'number' ? groupId : str(groupId)) ?? '') : ''

    if (groupName && !seenGroups.has(groupName)) {
      seenGroups.add(groupName)
      groups.push({ name: groupName, sort: groups.length })
    }

    items.push({
      title,
      url,
      description,
      groupName,
      sort: num(o.sort ?? o.Sort ?? o.order ?? o.Order),
    })
  }

  if (items.length === 0) return null
  return { groups, items }
}
