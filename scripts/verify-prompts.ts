/**
 * 校验 prompts 配置：确保所有导出存在且能正确生成文案（不依赖浏览器）。
 * 运行：npx tsx scripts/verify-prompts.ts
 */
import {
  PROMPT_QUOTE,
  PROMPT_TEST_CONNECTION,
  buildCategoryDescriptionPrompt,
  buildBookmarkSuggestionPrompt,
  AUTO_CLASSIFY,
  QUICK_ADD,
} from '../src/constants/prompts'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

console.log('校验 prompts 配置...')

// 固定文案
assert(PROMPT_QUOTE.length > 0 && PROMPT_QUOTE.includes('12'), 'PROMPT_QUOTE 应为非空且包含 12')
assert(PROMPT_TEST_CONNECTION.includes('连接成功'), 'PROMPT_TEST_CONNECTION 应包含「连接成功」')

// 分类描述
const categoryPrompt = buildCategoryDescriptionPrompt('测试分类', '示例A、示例B。')
assert(categoryPrompt.includes('测试分类') && categoryPrompt.includes('示例A'), 'buildCategoryDescriptionPrompt 应包含名称与示例')

// 书签建议（无分类）
const bookmarkNoCat = buildBookmarkSuggestionPrompt({
  url: 'https://example.com',
  title: 'Example',
  description: '',
  snippet: '',
  catList: '',
  withCategory: false,
})
assert(bookmarkNoCat.includes('example.com') && bookmarkNoCat.includes('"title"'), 'buildBookmarkSuggestionPrompt(withCategory:false) 应包含 URL 与 JSON 示例')
assert(!bookmarkNoCat.includes('category'), '无分类时不应包含 category 字段说明')

// 书签建议（有分类）
const bookmarkWithCat = buildBookmarkSuggestionPrompt({
  url: 'https://a.com',
  title: 'A',
  description: 'd',
  snippet: 's',
  catList: '现有分类列表: 技术, 生活。',
  withCategory: true,
})
assert(bookmarkWithCat.includes('现有分类列表') && bookmarkWithCat.includes('"category"'), 'buildBookmarkSuggestionPrompt(withCategory:true) 应包含分类与 category 示例')

// AUTO_CLASSIFY 片段
assert(AUTO_CLASSIFY.catListExistingPrefix.length > 0, 'AUTO_CLASSIFY.catListExistingPrefix')
assert(AUTO_CLASSIFY.catListEmpty.length > 0, 'AUTO_CLASSIFY.catListEmpty')
assert(AUTO_CLASSIFY.intro.length > 0, 'AUTO_CLASSIFY.intro')
assert(AUTO_CLASSIFY.linksIntro.length > 0, 'AUTO_CLASSIFY.linksIntro')

// QUICK_ADD 片段
assert(QUICK_ADD.catListExistingPrefix.length > 0, 'QUICK_ADD.catListExistingPrefix')
assert(QUICK_ADD.intro.length > 0, 'QUICK_ADD.intro')
assert(QUICK_ADD.formatExample.includes('url'), 'QUICK_ADD.formatExample 应包含 url')

console.log('✅ 所有 prompts 校验通过')
process.exit(0)
