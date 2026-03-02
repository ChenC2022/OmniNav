export interface SearchEngine {
  id: string
  name: string
  url: string
}

export const SEARCH_ENGINES: SearchEngine[] = [
  { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=' },
  { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=' },
  { id: 'baidu', name: '百度', url: 'https://www.baidu.com/s?wd=' },
  { id: 'github', name: 'GitHub', url: 'https://github.com/search?q=' },
]

export function getSearchUrl(engineId: string, query: string): string {
  const engine = SEARCH_ENGINES.find((e) => e.id === engineId) ?? SEARCH_ENGINES[0]
  return engine.url + encodeURIComponent(query)
}
