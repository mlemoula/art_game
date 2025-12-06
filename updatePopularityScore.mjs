import fetch from 'node-fetch'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const userAgent = '4rtW0rk-PopularityBot/1.0'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const fetchJson = async (url, init = {}) => {
  const res = await fetch(url, {
    ...init,
    headers: {
      'User-Agent': userAgent,
      ...(init.headers || {}),
    },
  })
  if (!res.ok) {
    throw new Error(`Request failed (${res.status}) for ${url}`)
  }
  return res.json()
}

const searchWikipediaTitle = async (name) => {
  try {
    const data = await fetchJson(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        name
      )}&format=json`
    )
    return data?.query?.search?.[0]?.title || null
  } catch {
    return null
  }
}

const fetchWikiExtractLength = async (title) => {
  if (!title) return 0
  try {
    const data = await fetchJson(
      `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&format=json&titles=${encodeURIComponent(
        title
      )}`
    )
    const pages = data?.query?.pages || {}
    const firstPage = Object.values(pages)[0]
    const text = firstPage?.extract || ''
    return text.split(/\r?\n/).filter((line) => line.trim()).length
  } catch {
    return 0
  }
}

const formatDate = (date) => {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

const fetchPageViews = async (title) => {
  if (!title) return 0
  const normalized = title.replace(/ /g, '_')
  const end = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const start = new Date(end.getTime() - 59 * 24 * 60 * 60 * 1000)
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(
    normalized
  )}/daily/${formatDate(start)}/${formatDate(end)}`
  try {
    const data = await fetchJson(url)
    const views = data?.items || []
    if (!views.length) return 0
    const total = views.reduce((sum, item) => sum + (item.views || 0), 0)
    return total / views.length
  } catch {
    return 0
  }
}

const searchWikidataId = async (name) => {
  try {
    const data = await fetchJson(
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&language=en&format=json&limit=1&search=${encodeURIComponent(
        name
      )}`
    )
    return data?.search?.[0]?.id || null
  } catch {
    return null
  }
}

const fetchSitelinkCount = async (wikidataId) => {
  if (!wikidataId) return 0
  try {
    const data = await fetchJson(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${wikidataId}&props=sitelinks&format=json`
    )
    const entity = data?.entities?.[wikidataId]
    return entity ? Object.keys(entity.sitelinks || {}).length : 0
  } catch {
    return 0
  }
}

const fetchMuseumPresence = async (wikidataId) => {
  if (!wikidataId) return 0
  const query = `
SELECT (COUNT(DISTINCT ?museum) AS ?count) WHERE {
  ?work wdt:P170 wd:${wikidataId}.
  ?work wdt:P195 ?museum.
}`
  try {
    const data = await fetchJson(
      `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(
        query
      )}`
    )
    const raw = data?.results?.bindings?.[0]?.count?.value
    return raw ? Number(raw) : 0
  } catch {
    return 0
  }
}

const calculateScore = ({
  hasWiki,
  extractLines,
  avgViews,
  museumCount,
  sitelinks,
}) => {
  let score = 0
  if (hasWiki) score += 20
  const extractBonus = Math.min(20, Math.log10(extractLines + 10) * 10)
  const pageviewScore = Math.min(30, Math.log10(avgViews + 1) * 10)
  const museumScore = Math.min(20, museumCount * 4)
  const notorietyScore = Math.min(10, sitelinks / 5)
  score += extractBonus + pageviewScore + museumScore + notorietyScore
  return Math.round(Math.min(100, score))
}

const updatePopularityScores = async () => {
  const { data: artists, error } = await supabase
    .from('artists')
    .select('id, name')
    .is('popularity_score', null)

  if (error) throw error

  for (const artist of artists) {
    await delay(250)
    const wikipediaTitle = await searchWikipediaTitle(artist.name)
    const extractLines = await fetchWikiExtractLength(wikipediaTitle)
    const avgViews = await fetchPageViews(wikipediaTitle)
    const wikidataId = await searchWikidataId(artist.name)
    const sitelinks = await fetchSitelinkCount(wikidataId)
    const museumCount = await fetchMuseumPresence(wikidataId)

    const score = calculateScore({
      hasWiki: Boolean(wikipediaTitle),
      extractLines,
      avgViews,
      museumCount,
      sitelinks,
    })

    console.log(
      `${artist.name} -> score ${score} (wiki:${wikipediaTitle || 'none'} views:${avgViews.toFixed(
        1
      )} museums:${museumCount} sitelinks:${sitelinks})`
    )

    await supabase
      .from('artists')
      .update({ popularity_score: score })
      .eq('id', artist.id)
  }
}

updatePopularityScores()
  .then(() => console.log('Popularity scores updated'))
  .catch((err) => {
    console.error('Failed to update popularity scores', err)
    process.exit(1)
  })
