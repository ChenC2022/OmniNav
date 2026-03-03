/**
 * 励志语录（静态），用于首页占位展示。
 * 后续可改为从 API 或 KV 拉取。
 */
export const QUOTES = [
  '今日事，今日毕。',
  '千里之行，始于足下。',
  '保持好奇，持续学习。',
  '少即是多。',
  '专注一事，做到极致。',
  '先完成，再完美。',
  '小步快跑，快速迭代。',
  '把时间花在重要的事上。',
  '简单就是美。',
  '做长期正确的事。',
  '保持简洁，保持专注。',
  '行动胜过空想。',
  '每天进步一点点。',
  '善用工具，提升效率。',
  '保持开放，拥抱变化。',
]

export function getRandomQuote(): string {
  return QUOTES[Math.floor(Math.random() * QUOTES.length)] ?? QUOTES[0]!
}
