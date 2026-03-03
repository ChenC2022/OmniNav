/**
 * 演示数据：多分类 + 每分类下多链接，用于查看首页展示效果。
 * 通过设置页「加载演示数据」注入，会追加到当前数据后并保存。
 */

import type { Bookmark } from '@/types'
import type { Category } from '@/types'
import { nanoid } from '@/utils/id'

export interface SeedCategoryInput {
  name: string
  order: number
  isPrivate?: boolean
}

export interface SeedBookmarkInput {
  title: string
  url: string
  description?: string
  categoryKey: string
  order: number
}

const SEED_CATEGORIES: SeedCategoryInput[] = [
  { name: '开发工具', order: 0 },
  { name: '设计资源', order: 1 },
  { name: '文档与博客', order: 2 },
  { name: '云与运维', order: 3 },
  { name: '学习', order: 4 },
  { name: '娱乐', order: 5 },
  { name: '未分类', order: 6 }, // 独立区域，用于未分类书签
]

const SEED_BOOKMARKS: SeedBookmarkInput[] = [
  // 开发工具
  { title: 'GitHub', url: 'https://github.com', categoryKey: '开发工具', order: 0 },
  { title: 'GitLab', url: 'https://gitlab.com', categoryKey: '开发工具', order: 1 },
  { title: 'Stack Overflow', url: 'https://stackoverflow.com', categoryKey: '开发工具', order: 2 },
  { title: 'MDN', url: 'https://developer.mozilla.org', description: 'Web 技术文档', categoryKey: '开发工具', order: 3 },
  { title: 'Vue.js', url: 'https://vuejs.org', categoryKey: '开发工具', order: 4 },
  { title: 'React', url: 'https://react.dev', categoryKey: '开发工具', order: 5 },
  { title: 'Tailwind CSS', url: 'https://tailwindcss.com', categoryKey: '开发工具', order: 6 },
  { title: 'Vite', url: 'https://vitejs.dev', categoryKey: '开发工具', order: 7 },
  { title: 'TypeScript', url: 'https://www.typescriptlang.org', categoryKey: '开发工具', order: 8 },
  { title: 'Node.js', url: 'https://nodejs.org', categoryKey: '开发工具', order: 9 },
  // 设计资源
  { title: 'Figma', url: 'https://figma.com', categoryKey: '设计资源', order: 0 },
  { title: 'Dribbble', url: 'https://dribbble.com', categoryKey: '设计资源', order: 1 },
  { title: 'Behance', url: 'https://www.behance.net', categoryKey: '设计资源', order: 2 },
  { title: 'Unsplash', url: 'https://unsplash.com', description: '免费图片', categoryKey: '设计资源', order: 3 },
  { title: 'Coolors', url: 'https://coolors.co', description: '配色生成', categoryKey: '设计资源', order: 4 },
  { title: 'Excalidraw', url: 'https://excalidraw.com', categoryKey: '设计资源', order: 5 },
  // 文档与博客
  { title: 'Google Docs', url: 'https://docs.google.com', categoryKey: '文档与博客', order: 0 },
  { title: 'Notion', url: 'https://notion.so', categoryKey: '文档与博客', order: 1 },
  { title: '语雀', url: 'https://yuque.com', categoryKey: '文档与博客', order: 2 },
  { title: '掘金', url: 'https://juejin.cn', categoryKey: '文档与博客', order: 3 },
  { title: '知乎', url: 'https://www.zhihu.com', categoryKey: '文档与博客', order: 4 },
  { title: 'V2EX', url: 'https://v2ex.com', categoryKey: '文档与博客', order: 5 },
  { title: 'Hacker News', url: 'https://news.ycombinator.com', categoryKey: '文档与博客', order: 6 },
  // 云与运维
  { title: 'Cloudflare', url: 'https://dash.cloudflare.com', categoryKey: '云与运维', order: 0 },
  { title: 'Vercel', url: 'https://vercel.com', categoryKey: '云与运维', order: 1 },
  { title: 'AWS Console', url: 'https://console.aws.amazon.com', categoryKey: '云与运维', order: 2 },
  { title: 'GitHub Actions', url: 'https://github.com/features/actions', categoryKey: '云与运维', order: 3 },
  { title: 'Docker Hub', url: 'https://hub.docker.com', categoryKey: '云与运维', order: 4 },
  // 学习
  { title: 'Coursera', url: 'https://www.coursera.org', categoryKey: '学习', order: 0 },
  { title: 'edX', url: 'https://www.edx.org', categoryKey: '学习', order: 1 },
  { title: 'freeCodeCamp', url: 'https://www.freecodecamp.org', categoryKey: '学习', order: 2 },
  { title: 'LeetCode', url: 'https://leetcode.com', categoryKey: '学习', order: 3 },
  { title: 'Google 开发者', url: 'https://developers.google.com', categoryKey: '学习', order: 4 },
  // 娱乐
  { title: 'YouTube', url: 'https://youtube.com', categoryKey: '娱乐', order: 0 },
  { title: 'Netflix', url: 'https://netflix.com', categoryKey: '娱乐', order: 1 },
  { title: 'Spotify', url: 'https://open.spotify.com', categoryKey: '娱乐', order: 2 },
  { title: 'Steam', url: 'https://store.steampowered.com', categoryKey: '娱乐', order: 3 },
  { title: 'Bilibili', url: 'https://www.bilibili.com', categoryKey: '娱乐', order: 4 },
]

export function buildSeedData(): { categories: Category[]; bookmarks: Bookmark[] } {
  const categoryIds = new Map<string, string>()
  const categories: Category[] = SEED_CATEGORIES.map((c, index) => {
    const id = nanoid()
    categoryIds.set(c.name, id)
    return {
      id,
      name: c.name,
      order: index,
      isPrivate: c.isPrivate,
    }
  })

  const bookmarks: Bookmark[] = SEED_BOOKMARKS.map((b) => {
    const categoryId = categoryIds.get(b.categoryKey)
    if (!categoryId) throw new Error(`Unknown category: ${b.categoryKey}`)
    return {
      id: nanoid(),
      title: b.title,
      url: b.url,
      description: b.description,
      categoryId,
      order: b.order,
      health: 'ok' as const,
    }
  })

  return { categories, bookmarks }
}
