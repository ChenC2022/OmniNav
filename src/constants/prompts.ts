/**
 * AI 提示词统一配置
 * 所有发给 AI 的固定文案与模板集中在此，便于修改与多语言扩展。
 */

// ========== 固定文案 ==========

/** 首页励志语/格言轮播：请求 AI 生成 12 句 */
export const PROMPT_QUOTE =
  '请随机生成 12 句简短的中文励志语或格言，用于个人首页轮播展示。每句单独一行，共 12 行；不要编号、不要引号、不要多余解释。'

/** 设置页「测试 AI 连接」时发送的验证指令 */
export const PROMPT_TEST_CONNECTION = '请回复"连接成功"四个字，不要其他内容。'

// ========== 分类描述生成（分类表单） ==========

/**
 * 根据分类名称与可选的书签示例，生成「用 AI 生成分类说明」的提示词
 */
export function buildCategoryDescriptionPrompt(name: string, examples: string): string {
  return `分类名称：${name}。${examples}请为该分类生成一句简短说明（1～2 句话），说明该分类的用途或范围，便于后续将书签归入时判断。只输出说明文字，不要引号或其它前缀。`
}

// ========== 书签信息建议（书签表单） ==========

export interface BookmarkSuggestionParams {
  url: string
  title: string
  description: string
  snippet: string
  catList: string
  withCategory: boolean
}

/**
 * 根据 URL、页面 meta、分类列表等，生成「AI 建议标题/描述/分类」的提示词
 */
export function buildBookmarkSuggestionPrompt(params: BookmarkSuggestionParams): string {
  const { url, title, description, snippet, catList, withCategory } = params
  const categoryInstruction = withCategory
    ? '同时请从上述分类列表中选择一个最合适的分类归属。'
    : ''
  const jsonExample = withCategory
    ? '{"title": "建议的标题", "description": "建议的描述", "category": "分类名"}'
    : '{"title": "建议的标题", "description": "建议的描述"}'
  return `URL: ${url}。
页面标题: ${title}
页面描述: ${description}
页面摘录: ${snippet}

${catList}
请根据以上信息为该书签建议一个更准确、简洁的标题（如站点名、产品名，2~15字）和一句简短描述（1~2句话，介绍内容或用途）。
${categoryInstruction}
请仅输出 JSON 格式，不要包含任何 Markdown 代码块或多余文字。格式示例：
${jsonExample}`
}

// ========== 未分类书签批量归类（首页） ==========

export const AUTO_CLASSIFY = {
  /** 有现有分类时，分类列表前的说明（后面接 \n + 分类行） */
  catListExistingPrefix:
    '现有分类（名称与说明，请根据说明判断归属）：',
  /** 无现有分类时的说明 */
  catListEmpty:
    '当前尚无任何现有分类，请为每条链接建议一个合适的新分类名（2～8 个字符），每条输出的 isNew 均应为 true，并填写 categoryDescription。',
  /** 规则总起 */
  intro: '请对以下未分类书签进行归类。规则：',
  /** 有现有分类时的规则 1 */
  rule1Existing:
    '1. 从现有分类中选一个最合适的（可参考分类说明），或若无合适分类则建议一个简短的新分类名（2～8 个字符）。',
  /** 无现有分类时的规则 1 */
  rule1Empty:
    '1. 为每条链接建议一个简短的新分类名（2～8 个字符），所有条目的 isNew 均填 true，并填写 categoryDescription（该新分类的一句简短说明）。',
  /** 规则 2 前半句 */
  rule2: '2. 仅输出一个 JSON 数组，不要其他说明。格式：',
  /** 选现有分类时的格式说明 */
  rule2NoteExisting:
    '   - 若选现有分类则 isNew 为 false，category 为现有分类名之一，不需 categoryDescription。',
  /** 建议新分类时的格式说明 */
  rule2NoteNew:
    '   - 若建议新分类则 isNew 为 true，category 为新分类名，且必须填写 categoryDescription。',
  /** 有页面摘要时：补全空描述 */
  descRule:
    '\n3. 若某链接的「当前描述: 空」，请根据标题、URL 或页面摘要生成一句简短说明（一两句话，介绍该链接用途或内容），放在 description 字段；若「当前描述: 已有」则 description 留空字符串。',
  /** 有页面摘要时：修正需修正的标题 */
  titleRule:
    '\n4. 若某链接的「当前标题: 需修正」（即标题为空或不够简洁或无意义），请根据页面摘要为该链接生成一个简短、准确的网站名称（如产品名、站点名，2～15 字），放在 title 字段；若「当前标题: 已有」则 title 留空字符串。',
  /** 链接列表标题 */
  linksIntro: '\n链接列表：',
  /** 有现有分类时的格式示例（无摘要） */
  formatExampleExistingNoSummary:
    '[{"id":"书签id","category":"分类名","isNew":false,"categoryDescription":"仅 isNew 为 true 时必填"}]',
  /** 有现有分类时的格式示例（有摘要） */
  formatExampleExistingWithSummary:
    '[{"id":"书签id","category":"分类名","isNew":false,"description":"可选","title":"可选","categoryDescription":"仅 isNew 为 true 时必填"}]',
  /** 无现有分类时的格式示例（无摘要） */
  formatExampleNewNoSummary:
    '[{"id":"书签id","category":"新分类名","isNew":true,"categoryDescription":"该分类的一句简短说明"}]',
  /** 无现有分类时的格式示例（有摘要） */
  formatExampleNewWithSummary:
    '[{"id":"书签id","category":"新分类名","isNew":true,"categoryDescription":"该分类的一句简短说明","description":"可选","title":"可选"}]',
} as const

// ========== 快速添加多条链接（首页） ==========

export const QUICK_ADD = {
  /** 有现有分类时，分类列表前的说明 */
  catListExistingPrefix: '现有分类（名称与说明）：',
  /** 无现有分类时的说明 */
  catListEmpty:
    '当前尚无任何分类，请为每条链接建议一个合适的新分类名（2～8 个字符），所有条目的 isNew 均应为 true。',
  /** 规则总起 */
  intro: '我要添加以下网址到书签收藏中，请为每条链接进行归类并生成信息。规则：',
  /** 有现有分类时的规则 1 */
  rule1Existing:
    '1. 优先从现有分类中选择最合适的；若无合适分类则建议一个简短新分类名（2～8 字符）。',
  /** 无现有分类时的规则 1 */
  rule1Empty: '1. 为每条链接建议一个简短新分类名（2～8 字符），isNew 均为 true。',
  /** 规则 2 */
  rule2: '2. 为每条链接生成一个准确的标题（产品名/站点名，2～15 字）和一句简短描述（介绍用途或内容）。',
  /** 规则 3 */
  rule3: '3. 仅输出一个 JSON 数组，不要其他说明。格式：',
  formatExample:
    '[{"url":"链接URL","title":"生成的标题","description":"简短描述","category":"分类名","isNew":false,"categoryDescription":"仅 isNew 为 true 时必填，该新分类的一句简短说明"}]',
  /** 选现有分类时的说明 */
  rule3NoteExisting: '   - 若选现有分类则 isNew 为 false，不需 categoryDescription。',
  /** 建议新分类时的说明 */
  rule3NoteNew: '   - 若建议新分类则 isNew 为 true，必须填写 categoryDescription。',
  /** 链接列表标题 */
  linksIntro: '\n链接列表：',
} as const
