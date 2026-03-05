import { ref, computed, onMounted, onUnmounted } from 'vue'
import { get12StaticQuotes, getRandomQuote } from '@/data/quotes'
import { apiFetch } from '@/utils/api'

const QUOTE_COUNT = 12
const ROTATE_INTERVAL_MS = 5 * 60 * 1000 // 5 分钟

// 模块级单例状态，保证多个组件共享同一份数据
const quoteList = ref<string[]>([])
const quoteIndex = ref(0)
const quoteTimerId = ref<ReturnType<typeof setInterval> | null>(null)
let initialized = false

const displayQuote = computed(() => quoteList.value[quoteIndex.value] ?? '')

const QUOTE_PROMPT = `请随机生成 12 句简短的中文励志语或格言，用于个人首页轮播展示。每句单独一行，共 12 行；不要编号、不要引号、不要多余解释。`

function parseQuotesFromResponse(text: string): string[] {
    const lines = text
        .split(/\r?\n/)
        .map((s) => s.replace(/^[\d、\.\s]+/, '').trim())
        .filter(Boolean)
    return lines.slice(0, QUOTE_COUNT)
}

function ensure12Quotes(list: string[]): string[] {
    if (list.length >= QUOTE_COUNT) return list.slice(0, QUOTE_COUNT)
    const result = [...list]
    while (result.length < QUOTE_COUNT) result.push(getRandomQuote())
    return result
}

async function fetchQuotesFromAI() {
    try {
        const res = await apiFetch('/api/ai/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [{ role: 'user', content: QUOTE_PROMPT }],
            }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error((data as { error?: string })?.error ?? '请求失败')
        const text = ((data as { message?: string })?.message ?? '').trim()
        const parsed = parseQuotesFromResponse(text)
        if (parsed.length > 0) quoteList.value = ensure12Quotes(parsed)
    } catch {
        quoteList.value = get12StaticQuotes()
    }
}

function nextQuote() {
    const len = Math.max(1, quoteList.value.length)
    quoteIndex.value = (quoteIndex.value + 1) % len
}

export function useQuotes() {
    // 仅首次调用时初始化
    if (!initialized) {
        initialized = true
        quoteList.value = get12StaticQuotes()
        fetchQuotesFromAI()
        quoteTimerId.value = setInterval(nextQuote, ROTATE_INTERVAL_MS)
    }

    return {
        displayQuote,
        nextQuote,
    }
}
