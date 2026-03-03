<script setup lang="ts">
import { computed, inject, provide, ref, watch, onMounted, onUnmounted } from 'vue'
import { onClickOutside } from '@vueuse/core'
import draggable from 'vuedraggable'
import { useBookmarksStore } from '@/stores/bookmarks'
import { useCategoriesStore } from '@/stores/categories'
import { usePinnedStore, MAX_PINNED } from '@/stores/pinned'
import type { Bookmark, Category } from '@/types'
import BookmarkIcon from '@/components/bookmark/BookmarkIcon.vue'
import CategoryCard from '@/components/category/CategoryCard.vue'
import CategoryForm from '@/components/category/CategoryForm.vue'
import { useHealthCheck } from '@/composables/useHealthCheck'
import { getRandomQuote } from '@/data/quotes'
import { nanoid } from '@/utils/id'
import { parseBookmarkHtml } from '@/utils/parseBookmarkHtml'

/** 用于存放「仅常用区」独立链接的分类名，不存在时会自动创建；在首页作为独立区域「未分类」展示 */
const PINNED_ONLY_CATEGORY_NAME = '未分类'
/** 旧名称，兼容已有数据并会迁移为「未分类」 */
const PINNED_ONLY_CATEGORY_NAMES_LEGACY = ['未分类链接', '快捷链接']

const bookmarksStore = useBookmarksStore()
const categoriesStore = useCategoriesStore()
const saveBookmarks = inject<() => Promise<void>>('saveBookmarks')
const saveCategories = inject<() => Promise<void>>('saveCategories')
const savePinned = inject<() => Promise<void>>('savePinned')
const pinnedStore = usePinnedStore()
const { checkOne } = useHealthCheck()
const dailyQuote = ref('')
onMounted(() => {
  dailyQuote.value = getRandomQuote()
  // 迁移：将旧名称「未分类链接」「快捷链接」改为「未分类」，刷新后即生效
  const legacy = categoriesStore.items.find((c) => PINNED_ONLY_CATEGORY_NAMES_LEGACY.includes(c.name))
  if (legacy && legacy.name !== PINNED_ONLY_CATEGORY_NAME) {
    categoriesStore.updateCategory(legacy.id, { name: PINNED_ONLY_CATEGORY_NAME })
    saveCategories?.()
  }
})

const pinnedBookmarks = computed((): Bookmark[] => {
  const list: Bookmark[] = []
  for (const id of pinnedStore.ids) {
    const b = bookmarksStore.items.find((x) => x.id === id)
    if (b) list.push(b)
  }
  return list
})

const categoriesOrdered = computed(() =>
  [...categoriesStore.items].sort((a, b) => a.order - b.order)
)

/** 未分类对应的分类（独立区域，不进入上方分类网格）；兼容旧名称「未分类链接」「快捷链接」 */
const uncategorizedCategory = computed(() => {
  const cat = categoriesStore.items.find(
    (c) => c.name === PINNED_ONLY_CATEGORY_NAME || PINNED_ONLY_CATEGORY_NAMES_LEGACY.includes(c.name)
  )
  return cat ?? null
})

/** 分类网格中展示的分类（排除未分类） */
const categoriesForGrid = computed(() =>
  categoriesOrdered.value.filter(
    (c) => c.name !== PINNED_ONLY_CATEGORY_NAME && !PINNED_ONLY_CATEGORY_NAMES_LEGACY.includes(c.name)
  )
)

const pinnedList = ref<Bookmark[]>([])
watch(pinnedBookmarks, (v) => { pinnedList.value = [...v] }, { immediate: true })

/** 编辑布局：开启后常用区卡片才可拖拽排序，且支持从分类拖入常用 */
const isEditLayout = ref(false)

/** 递增以通知各分类卡片重新从 store 同步列表（拖入常用后原分类列表恢复显示该书签） */
const categoryListsVersion = ref(0)
provide('categoryListsVersion', categoryListsVersion)

/** 分类区块标题栏：设置菜单（检查链接 / 新建分类） */
const categorySectionSettingsOpen = ref(false)
const categorySectionSettingsRef = ref<HTMLElement | null>(null)
const categorySectionSettingsTriggerRef = ref<HTMLElement | null>(null)
function closeCategorySectionSettings() {
  categorySectionSettingsOpen.value = false
}
onClickOutside(categorySectionSettingsRef, closeCategorySectionSettings, { ignore: [categorySectionSettingsTriggerRef] })

/** 可添加到常用的书签（未在常用区且未达上限） */
const addableBookmarks = computed(() => {
  const pinnedSet = new Set(pinnedStore.ids)
  const max = 16
  if (pinnedSet.size >= max) return []
  return bookmarksStore.items
    .filter((b) => !pinnedSet.has(b.id))
    .slice(0, 80)
})

const addToPinnedOpen = ref(false)
const addToPinnedRef = ref<HTMLElement | null>(null)
const addToPinnedFilter = ref('')

/** 根据关键词筛选可添加书签（匹配标题或 URL） */
const addableBookmarksFiltered = computed(() => {
  const q = addToPinnedFilter.value.trim().toLowerCase()
  if (!q) return addableBookmarks.value
  return addableBookmarks.value.filter(
    (b) =>
      b.title.toLowerCase().includes(q) ||
      b.url.toLowerCase().includes(q) ||
      (b.description && b.description.toLowerCase().includes(q))
  )
})

function openAddToPinned() {
  if (pinnedStore.ids.length >= MAX_PINNED) return
  addToPinnedFilter.value = ''
  newLinkTitle.value = ''
  newLinkUrl.value = ''
  addToPinnedOpen.value = true
}

function closeAddToPinned() {
  addToPinnedOpen.value = false
  addToPinnedFilter.value = ''
  newLinkTitle.value = ''
  newLinkUrl.value = ''
}

/** 获取或创建用于「仅常用」独立链接的分类；若存在旧名称则迁移为「未分类」 */
function getOrCreatePinnedOnlyCategory(): string {
  let cat = categoriesStore.items.find((c) => c.name === PINNED_ONLY_CATEGORY_NAME)
  if (cat) return cat.id
  cat = categoriesStore.items.find((c) => PINNED_ONLY_CATEGORY_NAMES_LEGACY.includes(c.name))
  if (cat) {
    categoriesStore.updateCategory(cat.id, { name: PINNED_ONLY_CATEGORY_NAME })
    saveCategories?.()
    return cat.id
  }
  const id = nanoid()
  categoriesStore.addCategory({
    id,
    name: PINNED_ONLY_CATEGORY_NAME,
    order: categoriesStore.items.length,
  })
  saveCategories?.()
  return id
}

const newLinkTitle = ref('')
const newLinkUrl = ref('')

function titleFromUrl(urlStr: string): string {
  try {
    const u = new URL(urlStr.startsWith('http') ? urlStr : `https://${urlStr}`)
    return u.hostname.replace(/^www\./, '') || urlStr
  } catch {
    return urlStr
  }
}

async function addNewLinkToPinned() {
  const title = newLinkTitle.value.trim()
  let url = newLinkUrl.value.trim()
  if (!url) return
  if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url
  const categoryId = getOrCreatePinnedOnlyCategory()
  const id = nanoid()
  const order = bookmarksStore.items.length
  const displayTitle = title || titleFromUrl(url)
  const bookmark: Bookmark = {
    id,
    title: displayTitle,
    url,
    categoryId,
    order,
  }
  bookmarksStore.addBookmark(bookmark)
  pinnedStore.add(id)
  await saveBookmarks?.()
  await savePinned?.()
  // 对新添加的独立链接做一次状态检查并保存
  await checkOne(bookmark)
  await saveBookmarks?.()
  newLinkTitle.value = ''
  newLinkUrl.value = ''
  closeAddToPinned()
}

async function addBookmarkToPinned(bookmark: Bookmark) {
  pinnedStore.add(bookmark.id)
  await savePinned?.()
  closeAddToPinned()
}

onClickOutside(addToPinnedRef, closeAddToPinned)

async function onPinnedDragEnd() {
  pinnedStore.reorder(pinnedList.value.map((b) => b.id))
  await savePinned?.()
}

/** 常用区列表 change：若从分类拖入则加入 pinned 并通知分类列表重同步 */
function onPinnedListChange(evt: { added?: { element: Bookmark }; from: HTMLElement; to: HTMLElement }) {
  if (!evt.added || evt.from === evt.to) return
  const bookmark = evt.added.element
  if (!bookmark?.id) return
  pinnedStore.add(bookmark.id)
  savePinned?.()
  categoryListsVersion.value++
}

const categoryFormOpen = ref(false)
const editingCategory = ref<Category | null>(null)

function openAddCategory() {
  editingCategory.value = null
  categoryFormOpen.value = true
}

function openEditCategory(c: Category) {
  editingCategory.value = c
  categoryFormOpen.value = true
}

function onSaveCategory(c: Category) {
  if (editingCategory.value) {
    categoriesStore.updateCategory(c.id, c)
  } else {
    categoriesStore.addCategory({ ...c, order: categoriesStore.items.length })
  }
  saveCategories?.()
  categoryFormOpen.value = false
  editingCategory.value = null
}

async function onDeleteCategory(id: string) {
  const cat = categoriesStore.items.find((c) => c.id === id)
  const isUncategorized =
    cat?.name === PINNED_ONLY_CATEGORY_NAME || (cat ? PINNED_ONLY_CATEGORY_NAMES_LEGACY.includes(cat.name) : false)
  if (!isUncategorized) {
    const targetCategoryId = getOrCreatePinnedOnlyCategory()
    const toMove = bookmarksStore.items.filter((b) => b.categoryId === id)
    for (const b of toMove) {
      bookmarksStore.updateBookmark(b.id, { categoryId: targetCategoryId })
    }
    if (toMove.length > 0) await saveBookmarks?.()
  }
  categoriesStore.removeCategory(id)
  await saveCategories?.()
}

const categoriesList = ref<Category[]>([])
watch(categoriesForGrid, (v) => { categoriesList.value = [...v] }, { immediate: true })

/** 分类区布局：true = CSS 多列（瀑布流风格，顺序按列）；false = Grid 自适应多列（当前方案，易回退） */
const USE_COLUMN_LAYOUT = true

function onCategoriesDragEnd() {
  categoriesList.value.forEach((c, i) => categoriesStore.updateCategory(c.id, { order: i }))
  // 保持「未分类」排在最后，不参与网格拖拽顺序
  if (uncategorizedCategory.value) {
    categoriesStore.updateCategory(uncategorizedCategory.value.id, { order: categoriesList.value.length })
  }
  saveCategories?.()
}

// 未分类区：头部「添加」调用的卡片 ref；导入 / 自动归类
const uncategorizedCardRef = ref<InstanceType<typeof CategoryCard> | null>(null)
const importFileInputRef = ref<HTMLInputElement | null>(null)
const importResult = ref('')
const importLoading = ref(false)

function onUncategorizedImport() {
  importResult.value = ''
  importFileInputRef.value?.click()
}

async function onImportFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  importLoading.value = true
  importResult.value = ''
  try {
    const text = await file.text()
    const items = parseBookmarkHtml(text)
    if (items.length === 0) {
      importResult.value = '未解析到有效链接，请确认为浏览器导出的书签 HTML 文件'
      return
    }
    const categoryId = getOrCreatePinnedOnlyCategory()
    const existingUrls = new Set(
      bookmarksStore.items.filter((b) => b.categoryId === categoryId).map((b) => b.url)
    )
    let added = 0
    const baseOrder = bookmarksStore.items.length
    for (let i = 0; i < items.length; i++) {
      if (existingUrls.has(items[i]!.url)) continue
      existingUrls.add(items[i]!.url)
      bookmarksStore.addBookmark({
        id: nanoid(),
        title: items[i]!.title,
        url: items[i]!.url,
        categoryId,
        order: baseOrder + added,
      })
      added++
    }
    await saveBookmarks?.()
    importResult.value = added > 0 ? `已导入 ${added} 个链接${added < items.length ? `，跳过 ${items.length - added} 个重复` : ''}` : '链接均已存在，未新增'
  } catch (err) {
    importResult.value = err instanceof Error ? err.message : '导入失败'
  } finally {
    importLoading.value = false
  }
}

/** 检测+清理 弹窗与流程（统一：全局 / 分类内 / 未分类内） */
const cleanInvalidLoading = ref(false)
const cleanInvalidProgressText = ref('')
const cleanInvalidScopeLabel = ref('')
const cleanInvalidCancelled = ref(false)
const cleanInvalidResult = ref('')
const cleanInvalidModalOpen = ref(false)
const invalidLinks = ref<Bookmark[]>([])
const selectedInvalidLinkIds = ref<Set<string>>(new Set())

type CheckCleanupScope = { type: 'all' } | { type: 'category'; categoryId: string }

function cancelCleanInvalidCheck() {
  cleanInvalidCancelled.value = true
}

async function runCheckAndCleanup(scope: CheckCleanupScope) {
  if (cleanInvalidLoading.value) return
  const links =
    scope.type === 'all'
      ? [...bookmarksStore.items]
      : bookmarksStore.items.filter((b) => b.categoryId === scope.categoryId)
  if (links.length === 0) return
  const scopeLabel =
    scope.type === 'all'
      ? '全部书签'
      : scope.categoryId === uncategorizedCategory.value?.id
        ? '未分类'
        : categoriesStore.items.find((c) => c.id === scope.categoryId)?.name ?? '该分类'
  cleanInvalidScopeLabel.value = scopeLabel
  cleanInvalidResult.value = ''
  cleanInvalidCancelled.value = false
  cleanInvalidLoading.value = true
  cleanInvalidProgressText.value = '正在准备…'
  const total = links.length
  try {
    for (let i = 0; i < links.length; i++) {
      if (cleanInvalidCancelled.value) break
      cleanInvalidProgressText.value = `正在检查链接 (${i + 1}/${total})…`
      await checkOne(links[i]!)
    }
    if (cleanInvalidCancelled.value) return
    const linkIds = new Set(links.map((b) => b.id))
    invalidLinks.value = bookmarksStore.items.filter((b) => linkIds.has(b.id) && b.health === 'error')
    if (invalidLinks.value.length === 0) {
      cleanInvalidResult.value = '范围内链接均可正常访问，无需清理'
      setTimeout(() => {
        if (cleanInvalidResult.value === '范围内链接均可正常访问，无需清理') cleanInvalidResult.value = ''
      }, 3000)
      return
    }
    selectedInvalidLinkIds.value = new Set(invalidLinks.value.map((b) => b.id))
    cleanInvalidModalOpen.value = true
  } catch (err) {
    if (!cleanInvalidCancelled.value) cleanInvalidResult.value = err instanceof Error ? err.message : '检查失败'
  } finally {
    cleanInvalidLoading.value = false
    cleanInvalidProgressText.value = ''
  }
}

/** 供 CategoryCard 调用的「分类内检测+清理」 */
function runCheckAndCleanupForCategory(categoryId: string) {
  runCheckAndCleanup({ type: 'category', categoryId })
}
provide('runCheckAndCleanupForCategory', runCheckAndCleanupForCategory)

function closeCleanInvalidModal() {
  cleanInvalidModalOpen.value = false
}

function toggleInvalidLinkSelection(id: string) {
  if (selectedInvalidLinkIds.value.has(id)) {
    selectedInvalidLinkIds.value.delete(id)
  } else {
    selectedInvalidLinkIds.value.add(id)
  }
}

async function confirmCleanInvalid() {
  if (selectedInvalidLinkIds.value.size === 0) {
    closeCleanInvalidModal()
    return
  }
  cleanInvalidResult.value = ''
  const toRemove = invalidLinks.value.filter((b) => selectedInvalidLinkIds.value.has(b.id))
  const hadPinned = toRemove.some((b) => pinnedStore.ids.includes(b.id))
  for (const b of toRemove) {
    bookmarksStore.removeBookmark(b.id)
    if (pinnedStore.ids.includes(b.id)) pinnedStore.remove(b.id)
  }
  try {
    await saveBookmarks?.()
    if (hadPinned) await savePinned?.()
    cleanInvalidResult.value = `已成功清理 ${toRemove.length} 个失效链接`
  } catch (err) {
    cleanInvalidResult.value = err instanceof Error ? err.message : '清理并保存失败'
  }
  closeCleanInvalidModal()
}

// ---------- 自动归类 ----------
const uncategorizedBookmarks = computed(() => {
  const cat = uncategorizedCategory.value
  if (!cat) return []
  return bookmarksStore.items
    .filter((b) => b.categoryId === cat.id)
    .sort((a, b) => a.order - b.order)
})

const autoClassifyPreOpen = ref(false)
const autoClassifyDeepAnalysis = ref(false)
const autoClassifyLoading = ref(false)
const autoClassifyProgressText = ref('')
const autoClassifyAbortRef = ref<AbortController | null>(null)
const autoClassifyResultOpen = ref(false)
const autoClassifyResultMessage = ref('')
const autoClassifySuggestions = ref<Array<{ bookmark: Bookmark; suggestedCategory: string; isNew: boolean; suggestedDescription?: string; suggestedTitle?: string; suggestedCategoryDescription?: string }>>([])
const autoClassifySelections = ref<Record<string, string>>({})
const autoClassifyDropdownOptions = computed(() => {
  const keep = { value: '__keep__', label: '暂不归类' }
  const existing = categoriesForGrid.value.map((c) => ({ value: c.id, label: c.name }))
  const hasExisting = categoriesForGrid.value.length > 0
  const newNames = new Set<string>()
  for (const s of autoClassifySuggestions.value) {
    if (s.suggestedCategory && (s.isNew || !hasExisting)) newNames.add(s.suggestedCategory)
  }
  const newOpts = [...newNames].map((n) => ({ value: `new:${n}`, label: `✨ [新] ${n}` }))
  return [keep, ...existing, ...newOpts]
})

function openAutoClassifyPreDialog() {
  if (uncategorizedBookmarks.value.length === 0) {
    autoClassifyResultMessage.value = '当前没有需要归类的链接'
    return
  }
  autoClassifyResultMessage.value = ''
  autoClassifyPreOpen.value = true
}

function closeAutoClassifyPreDialog() {
  autoClassifyPreOpen.value = false
}

function cancelAutoClassifyAnalysis() {
  autoClassifyAbortRef.value?.abort()
  autoClassifyLoading.value = false
  autoClassifyProgressText.value = ''
  autoClassifyAbortRef.value = null
}

function setAutoClassifySelection(bookmarkId: string, value: string) {
  autoClassifySelections.value = { ...autoClassifySelections.value, [bookmarkId]: value }
}

async function startAutoClassifyAnalysis() {
  const list = uncategorizedBookmarks.value
  if (list.length === 0) return
  closeAutoClassifyPreDialog()
  const ac = new AbortController()
  autoClassifyAbortRef.value = ac
  autoClassifyLoading.value = true
  autoClassifyProgressText.value = '正在准备…'
  autoClassifyResultMessage.value = ''
  try {
    let items: Array<{ id: string; title: string; url: string; summary?: string; description?: string }> = list.map((b) => ({
      id: b.id,
      title: b.title,
      url: b.url,
      description: b.description ?? '',
    }))
    if (autoClassifyDeepAnalysis.value) {
      const total = list.length
      const concurrency = 3
      for (let i = 0; i < list.length; i += concurrency) {
        if (ac.signal.aborted) break
        const done = Math.min(i + concurrency, total)
        autoClassifyProgressText.value = `正在抓取网页摘要 (${done}/${total})…`
        const chunk = list.slice(i, i + concurrency)
        const results = await Promise.allSettled(
          chunk.map(async (b) => {
            const res = await fetch('/api/extract-meta', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: b.url }),
              signal: ac.signal,
            })
            const data = await res.json().catch(() => ({}))
            if (!data.ok || !res.ok) return { id: b.id, title: b.title, url: b.url, description: b.description ?? '' }
            const parts = [data.title, data.description, data.snippet].filter(Boolean)
            return { id: b.id, title: b.title, url: b.url, summary: parts.join(' ').slice(0, 600), description: b.description ?? '' }
          })
        )
        for (let j = 0; j < results.length; j++) {
          const r = results[j]
          const b = chunk[j]
          if (r?.status === 'fulfilled' && r.value && b) {
            const idx = items.findIndex((x) => x.id === b.id)
            if (idx >= 0) items[idx] = r.value
          }
        }
      }
      if (ac.signal.aborted) return
    }
    autoClassifyProgressText.value = '正在请求 AI 分析…'
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: buildAutoClassifyPrompt(categoriesForGrid.value.map((c) => ({ name: c.name, description: c.description })), items) }] }),
      signal: ac.signal,
    })
    const data = await res.json().catch(() => ({}))
    if (ac.signal.aborted) return
    if (!res.ok) {
      const code = (data as { code?: string })?.code
      autoClassifyResultMessage.value =
        code === 'AI_NOT_CONFIGURED'
          ? 'AI 未配置，请到设置中填写 Base URL、Model 与 API Key'
          : (data as { error?: string })?.error ?? 'AI 请求失败'
      return
    }
    const rawText = (data as { message?: string })?.message ?? ''
    const parsed = parseAutoClassifyResponse(rawText, list.map((b) => b.id))
    if (!parsed.length) {
      autoClassifyResultMessage.value = '未能解析 AI 返回的归类建议，请重试'
      return
    }
    autoClassifySuggestions.value = parsed.map((p) => {
      const bookmark = list.find((b) => b.id === p.id)!
      return {
        bookmark,
        suggestedCategory: p.category,
        isNew: p.isNew === true,
        suggestedDescription: p.description,
        suggestedTitle: p.title,
        suggestedCategoryDescription: p.categoryDescription,
      }
    })
    const selections: Record<string, string> = {}
    for (const s of autoClassifySuggestions.value) {
      const cat = categoriesForGrid.value.find((c) => c.name === s.suggestedCategory)
      if (cat) selections[s.bookmark.id] = cat.id
      else if (s.suggestedCategory) selections[s.bookmark.id] = `new:${s.suggestedCategory}`
      else selections[s.bookmark.id] = '__keep__'
    }
    autoClassifySelections.value = selections
    autoClassifyResultOpen.value = true
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') return
    autoClassifyResultMessage.value = e instanceof Error ? e.message : '分析失败'
  } finally {
    autoClassifyLoading.value = false
    autoClassifyProgressText.value = ''
    autoClassifyAbortRef.value = null
  }
}

function titleIsEmptyOrDomain(title: string, url: string): boolean {
  const t = (title ?? '').trim()
  if (!t) return true
  const host = titleFromUrl(url)
  return t.toLowerCase() === host.toLowerCase()
}

function buildAutoClassifyPrompt(
  categories: Array<{ name: string; description?: string }>,
  items: Array<{ id: string; title: string; url: string; summary?: string; description?: string }>
): string {
  const hasExistingCategories = categories.length > 0
  const catList = hasExistingCategories
    ? `现有分类（名称与说明，请根据说明判断归属）：\n${categories.map((c) => (c.description ? `- ${c.name}：${c.description}` : `- ${c.name}`)).join('\n')}`
    : '当前尚无任何现有分类，请为每条链接建议一个合适的新分类名（2～8 个字符），每条输出的 isNew 均应为 true，并填写 categoryDescription。'
  const hasSummary = items.some((x) => x.summary)
  const rows = items
    .map((x) => {
      const titleStatus = hasSummary
        ? (titleIsEmptyOrDomain(x.title, x.url) ? '当前标题: 需修正' : '当前标题: 已有')
        : ''
      const descStatus = hasSummary ? ` 当前描述: ${(x.description ?? '').trim() ? '已有' : '空'}` : ''
      return `- id: "${x.id}" 标题: ${x.title || '（空）'} URL: ${x.url}${x.summary ? ` 页面摘要: ${x.summary}` : ''}${titleStatus}${descStatus}`
    })
    .join('\n')
  const descRule = hasSummary
    ? `
3. 若某链接的「当前描述: 空」，请根据标题、URL 或页面摘要生成一句简短说明（一两句话，介绍该链接用途或内容），放在 description 字段；若「当前描述: 已有」则 description 留空字符串。`
    : ''
  const titleRule = hasSummary
    ? `
4. 若某链接的「当前标题: 需修正」（即标题为空或仅为域名），请根据页面摘要为该链接生成一个简短、准确的网站名称（如产品名、站点名，2～15 字），放在 title 字段；若「当前标题: 已有」则 title 留空字符串。`
    : ''
  const rule1 = hasExistingCategories
    ? '1. 从现有分类中选一个最合适的（可参考分类说明），或若无合适分类则建议一个简短的新分类名（2～8 个字符）。'
    : '1. 为每条链接建议一个简短的新分类名（2～8 个字符），所有条目的 isNew 均填 true，并填写 categoryDescription（该新分类的一句简短说明）。'
  const formatExample = hasExistingCategories
    ? `[{"id":"书签id","category":"分类名","isNew":false${hasSummary ? ',"description":"可选","title":"可选"' : ''},"categoryDescription":"仅 isNew 为 true 时必填"}]`
    : `[{"id":"书签id","category":"新分类名","isNew":true,"categoryDescription":"该分类的一句简短说明"${hasSummary ? ',"description":"可选","title":"可选"' : ''}]`
  return `${catList}

请对以下未分类书签进行归类。规则：
${rule1}
2. 仅输出一个 JSON 数组，不要其他说明。格式：${formatExample}
   - 若选现有分类则 isNew 为 false，category 为现有分类名之一，不需 categoryDescription。
   - 若建议新分类则 isNew 为 true，category 为新分类名，且必须填写 categoryDescription。${descRule}${titleRule}

链接列表：
${rows}`
}

function parseAutoClassifyResponse(
  text: string,
  validIds: string[]
): Array<{ id: string; category: string; isNew: boolean; description?: string; title?: string; categoryDescription?: string }> {
  let jsonStr = text.trim()
  const codeMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeMatch) jsonStr = codeMatch[1].trim()
  try {
    const arr = JSON.parse(jsonStr) as unknown[]
    if (!Array.isArray(arr)) return []
    const validSet = new Set(validIds)
    return arr
      .filter(
        (x): x is { id: string; category: string; isNew?: boolean; description?: string; title?: string; categoryDescription?: string } =>
          typeof x === 'object' &&
          x !== null &&
          typeof (x as { id?: string }).id === 'string' &&
          typeof (x as { category?: string }).category === 'string'
      )
      .filter((x) => validSet.has(x.id))
      .map((x) => {
        const category = String(x.category).trim()
        const isNew = x.isNew === true
        return {
          id: x.id,
          category,
          isNew,
          description: typeof x.description === 'string' ? x.description.trim() : undefined,
          title: typeof x.title === 'string' ? x.title.trim() : undefined,
          categoryDescription: typeof (x as { categoryDescription?: string }).categoryDescription === 'string' ? String((x as { categoryDescription?: string }).categoryDescription).trim() : undefined,
        }
      })
  } catch {
    return []
  }
}

function closeAutoClassifyResultModal() {
  autoClassifyResultOpen.value = false
}

async function confirmAutoClassifyApply() {
  const cat = uncategorizedCategory.value
  if (!cat) return
  const nameToId: Record<string, string> = {}
  for (const c of categoriesForGrid.value) nameToId[c.name] = c.id
  const newNamesToCreate = new Set<string>()
  for (const [bid, val] of Object.entries(autoClassifySelections.value)) {
    if (val.startsWith('new:')) {
      const name = val.slice(4).trim()
      if (name && !nameToId[name]) newNamesToCreate.add(name)
    }
  }
  const newCategoryDescriptions: Record<string, string> = {}
  for (const s of autoClassifySuggestions.value) {
    if (s.isNew && s.suggestedCategory && s.suggestedCategoryDescription && !newCategoryDescriptions[s.suggestedCategory])
      newCategoryDescriptions[s.suggestedCategory] = s.suggestedCategoryDescription
  }
  let maxOrder = 0
  for (const c of categoriesStore.items) {
    if (c.name !== PINNED_ONLY_CATEGORY_NAME && !PINNED_ONLY_CATEGORY_NAMES_LEGACY.includes(c.name))
      maxOrder = Math.max(maxOrder, c.order)
  }
  for (const name of newNamesToCreate) {
    const id = nanoid()
    categoriesStore.addCategory({
      id,
      name,
      description: newCategoryDescriptions[name],
      order: ++maxOrder,
    })
    nameToId[name] = id
  }
  if (newNamesToCreate.size) await saveCategories?.()
  for (const s of autoClassifySuggestions.value) {
    const val = autoClassifySelections.value[s.bookmark.id]
    if (!val || val === '__keep__') continue
    const categoryId = val.startsWith('new:') ? nameToId[val.slice(4).trim()] : val
    const patch: { categoryId: string; description?: string; title?: string } = { categoryId }
    if (s.suggestedDescription && !(s.bookmark.description ?? '').trim()) {
      patch.description = s.suggestedDescription
    }
    if (s.suggestedTitle && titleIsEmptyOrDomain(s.bookmark.title, s.bookmark.url)) {
      patch.title = s.suggestedTitle
    }
    bookmarksStore.updateBookmark(s.bookmark.id, patch)
  }
  await saveBookmarks?.()
  autoClassifyResultMessage.value = `已成功归类 ${autoClassifySuggestions.value.filter((s) => autoClassifySelections.value[s.bookmark.id] && autoClassifySelections.value[s.bookmark.id] !== '__keep__').length} 个链接`
  closeAutoClassifyResultModal()
}

// 常用区书签右键菜单
const pinnedMenuOpen = ref(false)
const pinnedMenuPos = ref({ x: 0, y: 0 })
const pinnedMenuBookmark = ref<Bookmark | null>(null)
const pinnedMenuRef = ref<HTMLElement | null>(null)

function openPinnedContextMenu(e: MouseEvent, bookmark: Bookmark) {
  e.preventDefault()
  pinnedMenuBookmark.value = bookmark
  pinnedMenuPos.value = { x: e.clientX, y: e.clientY }
  pinnedMenuOpen.value = true
}

function closePinnedContextMenu() {
  pinnedMenuOpen.value = false
  pinnedMenuBookmark.value = null
}

function pinnedOpenInNewWindow(bookmark: Bookmark) {
  if (bookmark?.url) window.open(bookmark.url, '_blank', 'noopener,noreferrer')
  closePinnedContextMenu()
}

async function removeFromPinned(bookmark: Bookmark) {
  if (bookmark?.id) pinnedStore.remove(bookmark.id)
  await savePinned?.()
  closePinnedContextMenu()
}

onClickOutside(pinnedMenuRef, closePinnedContextMenu)

function onPinnedMenuKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closePinnedContextMenu()
}
onMounted(() => window.addEventListener('keydown', onPinnedMenuKeydown))
onUnmounted(() => window.removeEventListener('keydown', onPinnedMenuKeydown))

// 自动归类 / 清理失效 进行中：离开页面前提示，防止误刷新
function onBeforeUnload(e: BeforeUnloadEvent) {
  if (autoClassifyLoading.value || cleanInvalidLoading.value) {
    e.preventDefault()
    e.returnValue = ''
  }
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onUnmounted(() => window.removeEventListener('beforeunload', onBeforeUnload))
</script>

<template>
  <div class="home w-full max-w-[1920px] mx-auto px-0">
    <section class="big-icons mb-8 sm:mb-12">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4 sm:mb-5">
        <h2 class="section-title text-lg font-bold flex items-center gap-2.5 text-slate-800 dark-text-94">
          <span class="material-symbols-outlined text-indigo-500 dark:text-indigo-400 text-[22px]">push_pin</span>
          常用
        </h2>
        <label
          class="inline-flex items-center gap-2.5 cursor-pointer select-none"
          :title="isEditLayout ? '已开启：拖拽卡片可调整顺序' : '点击开启后，拖拽可调整常用顺序'"
        >
          <span class="text-sm font-medium text-slate-600 dark:text-slate-400">编辑布局</span>
          <span
            class="relative inline-flex h-8 w-12 shrink-0 rounded-xl border transition-colors duration-200 ease-in-out focus-within:ring-2 focus-within:ring-indigo-400 focus-within:ring-offset-2 focus-within:ring-offset-white dark:focus-within:ring-offset-slate-900"
            :class="isEditLayout
              ? 'bg-indigo-500 border-indigo-500 dark:bg-indigo-500 dark:border-indigo-500'
              : 'glass-translucent border border-slate-200/60 dark:border-white/20'"
          >
            <input
              v-model="isEditLayout"
              type="checkbox"
              class="sr-only peer"
            >
            <span
              class="pointer-events-none inline-block h-6 w-6 rounded-lg bg-white shadow-sm transition-transform duration-200 ease-in-out mt-1 ml-1"
              :class="isEditLayout ? 'translate-x-4' : 'translate-x-0'"
            />
          </span>
        </label>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 md:gap-4">
        <draggable
          v-model="pinnedList"
          item-key="id"
          :group="{ name: 'bookmarks', put: isEditLayout && pinnedBookmarks.length < MAX_PINNED }"
          class="contents"
          ghost-class="opacity-50"
          :disabled="!isEditLayout"
          @end="onPinnedDragEnd"
          @change="onPinnedListChange"
        >
          <template #item="{ element }">
            <div
              v-if="element"
              class="glass-translucent rounded-2xl p-4 card-hover cursor-context-menu"
              @contextmenu.prevent="openPinnedContextMenu($event, element)"
            >
              <BookmarkIcon :bookmark="element" size="lg" :show-title="true" class="!p-0" />
            </div>
          </template>
        </draggable>
        <button
          v-if="pinnedBookmarks.length < MAX_PINNED"
          type="button"
          class="flex flex-col items-center justify-center gap-2.5 p-4 rounded-2xl glass-translucent border-2 border-dashed border-slate-300/70 dark:border-white/20 text-slate-400 dark-text-94 hover:border-indigo-400/50 hover:text-indigo-500 dark:hover:border-indigo-400/50 dark:hover:text-indigo-400 transition-colors cursor-pointer min-h-[5rem]"
          :title="`添加新链接或从书签中选择（最多 ${MAX_PINNED} 个）`"
          @click="openAddToPinned"
        >
          <span class="material-symbols-outlined text-2xl">add</span>
          <span class="text-xs font-semibold">Add</span>
        </button>
      </div>
      <p v-if="pinnedBookmarks.length === 0" class="text-sm text-slate-500 dark:text-white/90 mt-4">
        点击「Add」添加新链接，或从分类书签中拖到此处置顶（最多 {{ MAX_PINNED }} 个）
      </p>
    </section>

    <!-- 励志语录占位（前期静态随机，后续可接 API/热搜） -->
    <section v-if="dailyQuote" class="quote-bar mb-8 sm:mb-10">
      <div class="rounded-2xl glass-translucent px-4 py-3 flex items-center gap-3 border border-slate-200/50 dark:border-white/10">
        <span class="material-symbols-outlined text-indigo-500 dark:text-indigo-400 text-xl shrink-0">format_quote</span>
        <p class="text-sm text-slate-600 dark:text-slate-300 italic flex-1 min-w-0">{{ dailyQuote }}</p>
      </div>
    </section>

    <section class="categories">
      <div class="relative z-10 flex flex-wrap items-center justify-between gap-3 mb-4 sm:mb-5">
        <h2 class="section-title text-lg font-bold flex items-center gap-2.5 text-slate-800 dark-text-94">
          <span class="material-symbols-outlined text-indigo-500 dark:text-indigo-400 text-[22px]">category</span>
          分类
        </h2>
        <div class="relative flex items-center" ref="categorySectionSettingsRef">
          <button
            ref="categorySectionSettingsTriggerRef"
            type="button"
            class="p-2.5 rounded-xl glass-translucent border border-slate-200/60 dark:border-white/20 text-slate-600 dark-text-94 hover:bg-slate-200/5 dark:hover:bg-white/5 transition-all duration-200 flex items-center justify-center cursor-pointer"
            title="设置"
            aria-haspopup="menu"
            :aria-expanded="categorySectionSettingsOpen"
            @click="categorySectionSettingsOpen = !categorySectionSettingsOpen"
          >
            <span class="material-symbols-outlined text-xl">settings</span>
          </button>
          <Transition name="menu-pop">
            <div
              v-if="categorySectionSettingsOpen"
              class="absolute right-0 top-full mt-1 flex flex-col gap-0.5 p-1 rounded-xl shadow-xl border border-slate-200 dark:border-white/20 bg-white dark:bg-white/10 dark:backdrop-blur-xl z-[110] min-w-[2.5rem] pointer-events-auto"
            >
              <button
                type="button"
                class="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-white/10 hover:text-amber-500 dark:hover:text-amber-400 transition-colors"
                title="检测并清理失效链接"
                :disabled="cleanInvalidLoading || bookmarksStore.items.length === 0"
                @click="closeCategorySectionSettings(); runCheckAndCleanup({ type: 'all' })"
              >
                <span class="material-symbols-outlined text-lg block">{{ cleanInvalidLoading ? 'progress_activity' : 'bolt' }}</span>
              </button>
              <button
                type="button"
                class="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-white/10 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                title="新建分类"
                @click="closeCategorySectionSettings(); openAddCategory()"
              >
                <span class="material-symbols-outlined text-lg block">add</span>
              </button>
            </div>
          </Transition>
        </div>
      </div>
      <draggable
        v-model="categoriesList"
        item-key="id"
        :class="USE_COLUMN_LAYOUT
          ? 'columns-1 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5 [column-gap:1rem]'
          : 'grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,360px),1fr))] items-start'"
        ghost-class="opacity-50"
        :disabled="!isEditLayout"
        @end="onCategoriesDragEnd"
      >
        <template #item="{ element }">
          <div :class="USE_COLUMN_LAYOUT ? 'break-inside-avoid mb-4' : ''">
            <CategoryCard
              :category="element"
              :edit-layout="isEditLayout"
              @edit-category="openEditCategory(element)"
              @delete-category="onDeleteCategory(element.id)"
            />
          </div>
        </template>
      </draggable>
      <p v-if="categoriesForGrid.length === 0 && !uncategorizedCategory" class="text-sm text-slate-500 dark:text-white/90 mt-6">
        点击「新建分类」添加第一个分类，再在分类中添加书签
      </p>
    </section>

    <!-- 未分类：独立区域，在分类下方；标题左侧，右侧为添加 / 导入 / 清理失效 / 自动归类 -->
    <section v-if="uncategorizedCategory" class="uncategorized-section mt-10 sm:mt-12">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4 sm:mb-5">
        <h2 class="section-title text-lg font-bold flex items-center gap-2.5 text-slate-800 dark-text-94">
          <span class="material-symbols-outlined text-indigo-500 dark:text-indigo-400 text-[22px]">link</span>
          未分类
        </h2>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="w-10 h-10 flex items-center justify-center shrink-0 rounded-xl text-sm font-medium transition-colors cursor-pointer bg-indigo-500 dark:bg-indigo-400 text-white hover:bg-indigo-600 dark:hover:bg-indigo-300"
            title="添加"
            aria-label="添加"
            @click="uncategorizedCardRef?.openAdd?.()"
          >
            <span class="material-symbols-outlined text-xl">add</span>
          </button>
          <input
            ref="importFileInputRef"
            type="file"
            accept=".html,text/html"
            class="hidden"
            aria-label="选择书签 HTML 文件"
            @change="onImportFileChange"
          >
          <button
            type="button"
            class="w-10 h-10 flex items-center justify-center shrink-0 rounded-xl text-sm font-medium transition-colors cursor-pointer glass-translucent border border-slate-200/60 dark:border-white/20 text-slate-600 dark-text-94 hover:bg-slate-200/5 dark:hover:bg-white/5 disabled:opacity-50"
            :disabled="importLoading"
            title="导入 Chrome / Edge / Firefox 导出的书签 HTML 文件"
            aria-label="导入"
            @click="onUncategorizedImport"
          >
            <span class="material-symbols-outlined text-xl">{{ importLoading ? 'progress_activity' : 'upload_file' }}</span>
          </button>
          <button
            type="button"
            class="w-10 h-10 flex items-center justify-center shrink-0 rounded-xl text-sm font-medium transition-colors cursor-pointer glass-translucent border border-slate-200/60 dark:border-white/20 text-slate-600 dark-text-94 hover:bg-slate-200/5 dark:hover:bg-white/5 disabled:opacity-50"
            :disabled="cleanInvalidLoading || uncategorizedBookmarks.length === 0"
            title="检测并清理失效链接"
            aria-label="检测并清理失效链接"
            @click="uncategorizedCategory && runCheckAndCleanup({ type: 'category', categoryId: uncategorizedCategory.id })"
          >
            <span class="material-symbols-outlined text-xl">{{ cleanInvalidLoading ? 'progress_activity' : 'bolt' }}</span>
          </button>
          <button
            type="button"
            class="w-10 h-10 flex items-center justify-center shrink-0 rounded-xl text-sm font-medium transition-colors cursor-pointer glass-translucent border border-slate-200/60 dark:border-white/20 text-slate-600 dark-text-94 hover:bg-slate-200/5 dark:hover:bg-white/5 disabled:opacity-50"
            :disabled="autoClassifyLoading"
            title="使用 AI 将未分类书签归入已有分类或建议新分类"
            aria-label="自动归类"
            @click="openAutoClassifyPreDialog"
          >
            <span class="material-symbols-outlined text-xl">{{ autoClassifyLoading ? 'progress_activity' : 'auto_awesome' }}</span>
          </button>
        </div>
      </div>
      <p v-if="importResult" class="mb-3 text-sm text-slate-600 dark:text-slate-400" :class="importResult.startsWith('已导入') ? 'text-green-600 dark:text-green-400' : ''">
        {{ importResult }}
      </p>
      <p v-if="cleanInvalidResult" class="mb-3 text-sm text-slate-600 dark:text-slate-400" :class="cleanInvalidResult.startsWith('已清理') ? 'text-green-600 dark:text-green-400' : ''">
        {{ cleanInvalidResult }}
      </p>
      <p v-if="autoClassifyResultMessage" class="mb-3 text-sm text-slate-600 dark:text-slate-400" :class="autoClassifyResultMessage.startsWith('已成功') ? 'text-green-600 dark:text-green-400' : ''">
        {{ autoClassifyResultMessage }}
      </p>
      <CategoryCard
        ref="uncategorizedCardRef"
        :category="uncategorizedCategory"
        :edit-layout="isEditLayout"
        :hide-title="true"
        :add-in-header="true"
        :no-rename-delete="true"
      />
    </section>

    <!-- 自动归类：预弹窗（数量 + 深度分析 + 开始分析） -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div
          v-if="autoClassifyPreOpen"
          class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/30 dark:bg-black/50 backdrop-blur-sm modal-fade-overlay"
          @click.self="closeAutoClassifyPreDialog"
        >
          <div class="modal-fade-panel w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-white/20 flex flex-col bg-white/95 dark:bg-white/5 backdrop-blur-xl overflow-hidden">
            <div class="px-4 py-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between shrink-0">
              <span class="font-semibold text-slate-800 dark-text-94 flex items-center gap-2">
                <span class="material-symbols-outlined text-indigo-500 text-[20px]">auto_awesome</span>
                AI 自动归类
              </span>
              <button type="button" class="p-2 rounded-lg hover:bg-slate-200/5 dark:hover:bg-white/5 text-slate-500 dark-text-94 transition-colors" aria-label="关闭" @click="closeAutoClassifyPreDialog">
                <span class="material-symbols-outlined">close</span>
              </button>
            </div>
            <div class="p-4 space-y-4">
              <p class="text-sm text-slate-600 dark:text-slate-400">
                将对 <strong class="text-slate-800 dark-text-94">{{ uncategorizedBookmarks.length }}</strong> 个未分类书签进行归类，可归入已有分类或由 AI 建议新分类。
              </p>
              <label class="flex items-center gap-3 cursor-pointer select-none">
                <input v-model="autoClassifyDeepAnalysis" type="checkbox" class="rounded border-slate-300 dark:border-slate-500 text-indigo-500 focus:ring-indigo-400">
                <span class="text-sm text-slate-700 dark-text-94">启用深度分析（抓取目标网页摘要以提高准确率，耗时较长）</span>
              </label>
            </div>
            <div class="px-4 py-3 border-t border-slate-200 dark:border-white/10 flex justify-end gap-2 bg-slate-50/50 dark:bg-white/5">
              <button type="button" class="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-white/10 transition-colors" @click="closeAutoClassifyPreDialog">
                取消
              </button>
              <button type="button" class="px-4 py-2 rounded-xl text-sm font-medium bg-indigo-500 dark:bg-indigo-400 text-white hover:bg-indigo-600 dark:hover:bg-indigo-300 transition-colors" @click="startAutoClassifyAnalysis">
                开始分析
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 自动归类：分析中进度（不可点击遮罩关闭，仅可取消） -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div
          v-if="autoClassifyLoading"
          class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/30 dark:bg-black/50 backdrop-blur-sm modal-fade-overlay"
        >
          <div class="modal-fade-panel w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 dark:border-white/20 flex flex-col bg-white/95 dark:bg-white/5 backdrop-blur-xl overflow-hidden">
            <div class="px-4 py-4 flex items-center gap-3 shrink-0">
              <span class="material-symbols-outlined text-indigo-500 text-2xl animate-pulse">hourglass_empty</span>
              <div>
                <p class="font-semibold text-slate-800 dark-text-94">分析中</p>
                <p class="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{{ autoClassifyProgressText }}</p>
              </div>
            </div>
            <p class="px-4 pb-3 text-xs text-slate-500 dark:text-slate-400">
              请勿关闭或刷新页面，分析完成后将弹出归类建议供您确认。
            </p>
            <div class="px-4 py-3 border-t border-slate-200 dark:border-white/10 flex justify-end bg-slate-50/50 dark:bg-white/5">
              <button
                type="button"
                class="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-white/10 transition-colors"
                @click="cancelAutoClassifyAnalysis"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 自动归类：结果弹窗（下拉可改 + 确认应用） -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div
          v-if="autoClassifyResultOpen"
          class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/30 dark:bg-black/50 backdrop-blur-sm modal-fade-overlay"
          @click.self="closeAutoClassifyResultModal"
        >
          <div class="modal-fade-panel w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl shadow-2xl border border-slate-200 dark:border-white/20 flex flex-col bg-white/95 dark:bg-white/5 backdrop-blur-xl">
            <div class="px-4 py-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between shrink-0">
              <span class="font-semibold text-slate-800 dark-text-94 flex items-center gap-2">
                <span class="material-symbols-outlined text-indigo-500 text-[20px]">label</span>
                AI 归类建议
              </span>
              <button type="button" class="p-2 rounded-lg hover:bg-slate-200/5 dark:hover:bg-white/5 text-slate-500 dark-text-94 transition-colors" aria-label="关闭" @click="closeAutoClassifyResultModal">
                <span class="material-symbols-outlined">close</span>
              </button>
            </div>
            <div class="p-3 bg-indigo-50/50 dark:bg-indigo-500/10 border-b border-indigo-100 dark:border-indigo-500/20 shrink-0">
              <p class="text-sm text-indigo-800 dark:text-indigo-200">
                请确认或修改每条链接的目标分类，然后点击「确认应用」。选择「暂不归类」将保留在未分类中。
              </p>
              <p v-if="autoClassifySuggestions.some((s) => s.suggestedDescription || s.suggestedTitle)" class="text-xs text-indigo-600 dark:text-indigo-300 mt-1">
                启用深度分析时：描述为空会生成简短说明；标题为空或仅为域名会建议正确标题，确认后将一并写入。
              </p>
            </div>
            <div class="overflow-y-auto min-h-0 flex-1 py-2">
              <div
                v-for="s in autoClassifySuggestions"
                :key="s.bookmark.id"
                class="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-100/50 dark:hover:bg-white/5"
              >
                <div class="min-w-0 flex-1">
                  <p class="font-medium text-sm text-slate-800 dark-text-94 truncate">
                    {{ s.bookmark.title || '（无标题）' }}
                    <span v-if="s.suggestedTitle" class="text-indigo-600 dark:text-indigo-400 font-normal"> → {{ s.suggestedTitle }}</span>
                  </p>
                  <p class="text-xs text-slate-500 dark:text-slate-400 truncate">{{ s.bookmark.url }}</p>
                  <p v-if="s.suggestedDescription" class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2" title="将写入书签描述">
                    <span class="text-indigo-600 dark:text-indigo-400">描述：</span>{{ s.suggestedDescription }}
                  </p>
                </div>
                <select
                  :value="autoClassifySelections[s.bookmark.id]"
                  class="shrink-0 w-40 max-w-[50%] px-3 py-2 rounded-xl border border-slate-200 dark:border-white/20 bg-white dark:bg-slate-800/50 text-slate-800 dark-text-94 text-sm focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 outline-none"
                  @change="(e) => setAutoClassifySelection(s.bookmark.id, (e.target as HTMLSelectElement).value)"
                >
                  <option v-for="opt in autoClassifyDropdownOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
              </div>
            </div>
            <div class="px-4 py-3 border-t border-slate-200 dark:border-white/10 flex justify-end gap-3 shrink-0 bg-slate-50/50 dark:bg-white/5">
              <button type="button" class="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-white/10 transition-colors" @click="closeAutoClassifyResultModal">
                取消
              </button>
              <button type="button" class="px-4 py-2 rounded-xl text-sm font-medium bg-indigo-500 dark:bg-indigo-400 text-white hover:bg-indigo-600 dark:hover:bg-indigo-300 transition-colors" @click="confirmAutoClassifyApply">
                确认应用
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 常用区「添加」弹窗：从书签列表选择添加到常用 -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div
          v-if="addToPinnedOpen"
          class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/30 dark:bg-black/50 backdrop-blur-sm modal-fade-overlay"
          @click.self="closeAddToPinned"
        >
          <div
            ref="addToPinnedRef"
            class="add-to-pinned-modal modal-fade-panel w-full max-w-md max-h-[70vh] overflow-hidden rounded-2xl shadow-2xl border border-slate-200 dark:border-white/20 flex flex-col bg-white/95 dark:bg-white/5 backdrop-blur-xl"
          >
          <div class="px-4 py-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between shrink-0">
            <span class="font-semibold text-slate-800 dark-text-94">添加到常用</span>
            <button type="button" class="p-2 rounded-lg hover:bg-slate-200/5 dark:hover:bg-white/5 text-slate-500 dark-text-94 transition-colors" aria-label="关闭" @click="closeAddToPinned">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          <!-- 添加新链接（独立标签，可不属于任何已有分类） -->
          <div class="px-4 py-3 border-b border-slate-100 dark:border-white/10 shrink-0 space-y-2">
            <p class="text-xs font-medium text-slate-500 dark-text-94">添加新链接</p>
            <input
              v-model="newLinkTitle"
              type="text"
              class="add-to-pinned-input w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/20 bg-slate-50 dark:bg-transparent text-slate-800 dark:text-white text-sm placeholder-slate-400 dark:placeholder-white/50 focus:ring-2 focus:ring-indigo-400/50 focus:border-indigo-400 outline-none transition-colors"
              placeholder="标题（可选，不填则用网址域名）"
            />
            <input
              v-model="newLinkUrl"
              type="url"
              class="add-to-pinned-input w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/20 bg-slate-50 dark:bg-transparent text-slate-800 dark:text-white text-sm placeholder-slate-400 dark:placeholder-white/50 focus:ring-2 focus:ring-indigo-400/50 focus:border-indigo-400 outline-none transition-colors"
              placeholder="https://..."
            />
            <button
              type="button"
              class="w-full py-2.5 rounded-xl bg-indigo-500 dark:bg-indigo-400 text-white text-sm font-bold hover:bg-indigo-600 dark:hover:bg-indigo-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="!newLinkUrl.trim()"
              @click="addNewLinkToPinned"
            >
              添加并置顶
            </button>
          </div>
          <!-- 从已有书签选择 -->
          <div class="px-4 py-2 border-b border-slate-100 dark:border-white/10 shrink-0">
            <input
              v-model="addToPinnedFilter"
              type="text"
              class="add-to-pinned-input w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/20 bg-slate-50 dark:bg-transparent text-slate-800 dark:text-white text-sm placeholder-slate-400 dark:placeholder-white/50 focus:ring-2 focus:ring-indigo-400/50 focus:border-indigo-400 outline-none transition-colors"
              placeholder="或搜索已有书签…"
            />
          </div>
          <div class="overflow-y-auto py-2 min-h-0">
            <button
              v-for="b in addableBookmarksFiltered"
              :key="b.id"
              type="button"
              class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-200/5 dark:hover:bg-white/5 transition-colors"
              @click="addBookmarkToPinned(b)"
            >
              <span class="font-medium text-slate-800 dark-text-94 truncate flex-1 min-w-0">{{ b.title }}</span>
              <span class="text-slate-400 dark-text-94 text-xs truncate max-w-[10rem] shrink-0 opacity-80">{{ b.url }}</span>
              <span class="material-symbols-outlined text-indigo-500 dark:text-indigo-400 text-lg shrink-0">add_circle</span>
            </button>
            <p v-if="addableBookmarks.length === 0 && !addToPinnedFilter.trim()" class="px-4 py-4 text-center text-sm text-slate-500 dark:text-94">
              暂无其他书签可选，请在上方直接添加新链接
            </p>
            <p v-else-if="addableBookmarksFiltered.length === 0" class="px-4 py-4 text-center text-sm text-slate-500 dark-text-94">
              无匹配的书签，请调整关键词或在上方添加新链接
            </p>
          </div>
        </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 清理失效：检查中进度（不可点击遮罩关闭，仅可取消） -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div
          v-if="cleanInvalidLoading"
          class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/30 dark:bg-black/50 backdrop-blur-sm modal-fade-overlay"
        >
          <div class="modal-fade-panel w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 dark:border-white/20 flex flex-col bg-white/95 dark:bg-white/5 backdrop-blur-xl overflow-hidden">
            <div class="px-4 py-4 flex items-center gap-3 shrink-0">
              <span class="material-symbols-outlined text-amber-500 text-2xl animate-pulse">hourglass_empty</span>
              <div>
                <p class="font-semibold text-slate-800 dark-text-94">检查中</p>
                <p class="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{{ cleanInvalidProgressText }}</p>
              </div>
            </div>
            <p class="px-4 pb-3 text-xs text-slate-500 dark:text-slate-400">
              正在检测「{{ cleanInvalidScopeLabel }}」的可用性，完成后将列出失效链接供您确认清理。请勿关闭或刷新页面。
            </p>
            <div class="px-4 py-3 border-t border-slate-200 dark:border-white/10 flex justify-end bg-slate-50/50 dark:bg-white/5">
              <button
                type="button"
                class="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-white/10 transition-colors"
                @click="cancelCleanInvalidCheck"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 清理失效链接确认弹窗 -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div
          v-if="cleanInvalidModalOpen"
          class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/30 dark:bg-black/50 backdrop-blur-sm modal-fade-overlay"
          @click.self="closeCleanInvalidModal"
        >
          <div
            class="modal-fade-panel w-full max-w-lg max-h-[80vh] overflow-hidden rounded-2xl shadow-2xl border border-slate-200 dark:border-white/20 flex flex-col bg-white/95 dark:bg-white/5 backdrop-blur-xl"
          >
            <div class="px-4 py-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between shrink-0">
              <span class="font-semibold text-slate-800 dark-text-94 flex items-center gap-2">
                <span class="material-symbols-outlined text-red-500 text-[20px]">warning</span>
                发现失效链接
              </span>
              <button type="button" class="p-2 rounded-lg hover:bg-slate-200/5 dark:hover:bg-white/5 text-slate-500 dark-text-94 transition-colors" aria-label="关闭" @click="closeCleanInvalidModal">
                <span class="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div class="p-4 bg-red-50/50 dark:bg-red-500/10 border-b border-red-100 dark:border-red-500/20 shrink-0">
              <p class="text-sm text-red-600 dark:text-red-400">
                请确认要清理的链接。清理后将从分类中移除（含常用置顶记录）。
              </p>
            </div>

            <div class="overflow-y-auto p-2 min-h-0 flex-1">
              <label
                v-for="b in invalidLinks"
                :key="b.id"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-200/5 dark:hover:bg-white/5 transition-colors cursor-pointer select-none"
              >
                <div class="relative flex items-center justify-center w-5 h-5 shrink-0">
                  <input
                    type="checkbox"
                    class="peer sr-only"
                    :checked="selectedInvalidLinkIds.has(b.id)"
                    @change="toggleInvalidLinkSelection(b.id)"
                  >
                  <div class="w-4 h-4 rounded border border-slate-300 dark:border-slate-500 peer-checked:bg-indigo-500 peer-checked:border-indigo-500 dark:peer-checked:bg-indigo-400 dark:peer-checked:border-indigo-400 transition-colors flex items-center justify-center">
                    <span class="material-symbols-outlined text-white text-[12px] opacity-0 peer-checked:opacity-100 transition-opacity">check</span>
                  </div>
                </div>
                <div class="flex flex-col min-w-0 flex-1">
                  <span class="font-medium text-sm text-slate-800 dark-text-94 truncate">{{ b.title }}</span>
                  <span class="text-slate-400 dark:text-slate-500 text-xs truncate">{{ b.url }}</span>
                </div>
              </label>
            </div>

            <div class="px-4 py-3 border-t border-slate-200 dark:border-white/10 flex items-center justify-end gap-3 shrink-0 bg-slate-50/50 dark:bg-white/5">
              <button
                type="button"
                class="px-4 py-2 rounded-xl text-sm font-medium transition-colors text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-white/10"
                @click="closeCleanInvalidModal"
              >
                取消
              </button>
              <button
                type="button"
                class="px-4 py-2 rounded-xl text-sm font-medium transition-colors bg-red-500 dark:bg-red-500/80 text-white hover:bg-red-600 dark:hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="selectedInvalidLinkIds.size === 0"
                @click="confirmCleanInvalid"
              >
                确认清理 ({{ selectedInvalidLinkIds.size }})
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 常用区书签右键菜单 -->
    <Teleport to="body">
      <Transition name="menu-pop">
        <div
          v-if="pinnedMenuOpen && pinnedMenuBookmark"
          ref="pinnedMenuRef"
          class="fixed z-[100] min-w-[140px] py-1.5 bg-white dark:bg-white/10 backdrop-blur-xl rounded-2xl shadow-xl border border-slate-200 dark:border-white/20 menu-pop-root"
          :style="{ left: `${pinnedMenuPos.x}px`, top: `${pinnedMenuPos.y}px` }"
        >
        <button
          type="button"
          class="w-full text-left px-4 py-2.5 text-sm text-slate-800 dark:text-white hover:bg-slate-200/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
          @click="pinnedOpenInNewWindow(pinnedMenuBookmark)"
        >
          新窗口打开
        </button>
        <div class="my-1 border-t border-slate-200 dark:border-slate-600" />
        <button
          type="button"
          class="w-full text-left px-4 py-2.5 text-sm text-slate-800 dark:text-white hover:bg-slate-200/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
          @click="removeFromPinned(pinnedMenuBookmark)"
        >
          从常用移除
        </button>
        </div>
      </Transition>
    </Teleport>

    <CategoryForm
      v-model="categoryFormOpen"
      :edit="editingCategory"
      :order="categoriesOrdered.length"
      @save="onSaveCategory"
    />
  </div>
</template>
