import fetch from 'node-fetch'

export const USER_AGENT = 'Who Painted This? Artist Helper/1.0'

const wikipediaTitleCache = new Map()
const wikidataCache = new Map()
const wikidataEntityCache = new Map()

export const normalizeName = (name = '') => name.trim().toLowerCase()
export const normalizeImageKey = (url = '') =>
  url.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '')

export const normalizeForMatch = (value = '') =>
  value
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

export const fetchJson = async (url, init = {}) => {
  const response = await fetch(url, {
    ...init,
    headers: {
      'User-Agent': USER_AGENT,
      ...(init.headers || {}),
    },
  })
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`)
  }
  return response.json()
}

export const searchWikipediaTitle = async (name) => {
  if (!name) return null
  const key = normalizeName(name)
  if (wikipediaTitleCache.has(key)) return wikipediaTitleCache.get(key)
  try {
    const data = await fetchJson(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        name
      )}&format=json`
    )
    const title = data?.query?.search?.[0]?.title || null
    wikipediaTitleCache.set(key, title)
    return title
  } catch {
    wikipediaTitleCache.set(key, null)
    return null
  }
}

export const buildWikipediaUrl = (title) => {
  if (!title) return null
  const normalized = title.replace(/ /g, '_')
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(normalized)}`
}

export const resolveArtistWikiSummaryUrl = async (name) => {
  if (!name) return null
  const key = normalizeName(name)
  if (wikipediaTitleCache.has(key)) {
    const cached = wikipediaTitleCache.get(key)
    return buildWikipediaUrl(cached)
  }
  const title = await searchWikipediaTitle(name)
  if (!title) {
    wikipediaTitleCache.set(key, null)
    return null
  }
  return buildWikipediaUrl(title)
}

export const searchWikidataId = async (name) => {
  if (!name) return null
  const key = normalizeName(name)
  if (wikidataCache.has(key)) return wikidataCache.get(key)
  try {
    const data = await fetchJson(
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&language=en&format=json&limit=1&search=${encodeURIComponent(
        name
      )}`
    )
    const matches = data?.search || []
    const normalizedQuery = normalizeForMatch(name)
    const exactMatch =
      matches.find((entry) => {
        const label = normalizeForMatch(entry.label)
        const matchText = normalizeForMatch(entry.match?.text)
        const aliasMatch = (entry.aliases || []).some(
          (alias) => normalizeForMatch(alias) === normalizedQuery
        )
        return (
          label === normalizedQuery ||
          matchText === normalizedQuery ||
          aliasMatch
        )
      }) || null
    let matched = exactMatch || matches[0]
    if (!exactMatch && matches.length) {
      for (const entry of matches) {
        try {
          const title = await getEnglishWikiTitleFromId(entry.id)
          if (title && normalizeForMatch(title) === normalizedQuery) {
            matched = entry
            break
          }
        } catch {
          // ignore and continue
        }
      }
    }
    const id = matched?.id || null
    wikidataCache.set(key, id)
    return id
  } catch {
    wikidataCache.set(key, null)
    return null
  }
}

export const getEnglishWikiTitleFromId = async (wikidataId) => {
  if (!wikidataId) return null
  if (wikidataEntityCache.has(wikidataId)) {
    return wikidataEntityCache.get(wikidataId)
  }
  try {
    const data = await fetchJson(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(
        wikidataId
      )}&props=sitelinks&sitefilter=enwiki&format=json`
    )
    const entity = data?.entities?.[wikidataId]
    const title = entity?.sitelinks?.enwiki?.title || null
    wikidataEntityCache.set(wikidataId, title)
    return title
  } catch {
    wikidataEntityCache.set(wikidataId, null)
    return null
  }
}
