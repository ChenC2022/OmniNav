export type ThemeMode = 'light' | 'dark' | 'system'

export interface Bookmark {
  id: string
  title: string
  url: string
  description?: string
  categoryId: string
  favicon?: string
  order: number
  health?: 'ok' | 'warn' | 'error'
  createdAt?: string
  updatedAt?: string
}

export interface Category {
  id: string
  name: string
  order: number
  isPrivate?: boolean
  passwordHint?: string
  /** 私密分类密码的哈希，仅校验用，不存明文 */
  passwordHash?: string
  createdAt?: string
  updatedAt?: string
}

export interface Settings {
  theme?: ThemeMode
  defaultSearchEngine?: string
  ai?: {
    provider?: string
    baseUrl?: string
    model?: string
    /** 仅后端存储，不返回前端 */
    apiKey?: string
  }
  /** 天气位置：自动检测 或 选择城市（存 cityName, countryCode, lat, lon） */
  weather?: {
    mode?: 'auto' | 'city'
    cityName?: string
    countryCode?: string
    lat?: number
    lon?: number
  }
}
