const MAX_WIKI_PARAGRAPHS = 4
const DESCRIPTION_TRUNCATE = 140

const stripHtml = (value: string) => {
  const content = value || ''
  if (typeof window !== 'undefined' && 'DOMParser' in window) {
    const parser = new DOMParser()
    const doc = parser.parseFromString(content, 'text/html')
    return doc.body.textContent || ''
  }
  return content.replace(/<[^>]+>/g, ' ')
}

export const extractParagraphs = (raw: string) =>
  stripHtml(raw || '')
    .replace(/\r/g, '')
    .split(/\n{2,}|\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, MAX_WIKI_PARAGRAPHS)

export const extractTextFromWikiJson = (payload: unknown): string => {
  if (!payload || typeof payload !== 'object') return ''
  const data = payload as Record<string, unknown>
  if (typeof data.extract === 'string') return data.extract
  if (typeof data.extract_html === 'string') return data.extract_html
  if (typeof data.summary === 'string') return data.summary
  if (typeof data.content === 'string') return data.content
  const query = data.query
  if (query && typeof query === 'object') {
    const pages = (query as { pages?: unknown }).pages
    if (pages && typeof pages === 'object') {
      const firstPage = Object.values(pages)[0] as Record<string, unknown>
      if (firstPage) {
        if (typeof firstPage.extract === 'string') return firstPage.extract
        if (typeof firstPage.summary === 'string') return firstPage.summary
      }
    }
  }
  return ''
}

export const buildWikiApiUrl = (raw: string) => {
  try {
    const url = new URL(raw)
    if (!url.hostname.includes('wikipedia.org')) return raw
    const lang = url.hostname.split('.')[0]
    const title = decodeURIComponent(url.pathname.split('/').pop() || '')
    if (!title) return raw
    return `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
      title
    )}`
  } catch {
    return raw
  }
}

const truncateText = (value: string) =>
  value.length > DESCRIPTION_TRUNCATE
    ? `${value.slice(0, DESCRIPTION_TRUNCATE - 1).trim()}…`
    : value

export const fetchWikiDescription = async (sourceUrl?: string) => {
  if (!sourceUrl) return null
  try {
    const descriptionUrl = buildWikiApiUrl(sourceUrl)
    const response = await fetch(descriptionUrl, {
      headers: { accept: 'application/json' },
      next: { revalidate: 3600 },
    })
    if (!response.ok) return null
    const data = await response.json()
    const text = extractTextFromWikiJson(data)
    if (!text) return null
    const paragraphs = extractParagraphs(text)
    if (!paragraphs.length) return null
    return truncateText(paragraphs.join(' '))
  } catch {
    return null
  }
}
