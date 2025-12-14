import fetch from 'node-fetch'
import { createClient } from '@supabase/supabase-js'
import {
  fetchJson,
  getEnglishWikiTitleFromId,
  searchWikipediaTitle,
  searchWikidataId,
} from './lib/artistWikiHelper.js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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

const KNOWN_MASTERS = new Set([
  'raphael',
  'michelangelo',
  'leonardo da vinci',
  'rembrandt',
  'albrecht dürer',
  'pablo picasso',
  'vincent van gogh',
  'claude monet',
])

const calculateScore = ({
  artistName,
  hasWiki,
  extractLines,
  avgViews,
  museumCount,
  sitelinks,
}) => {
  let score = 0
  if (hasWiki) score += 15
  if (KNOWN_MASTERS.has(artistName?.toLowerCase() || '')) score += 10
  const extractBonus = Math.min(18, Math.log10(extractLines + 20) * 9)
  const pageviewScore = Math.min(35, Math.log10(avgViews + 5) * 12)
  const museumScore = Math.min(25, museumCount * 3.5)
  const notorietyScore = Math.min(12, Math.log10(sitelinks + 1) * 5)
  score += extractBonus + pageviewScore + museumScore + notorietyScore
  return Math.round(Math.min(100, score))
}

const updatePopularityScores = async () => {
  const { data: artists, error } = await supabase
    .from('artists')
    .select('id, name, wikidata_id')
    .is('popularity_score', null)

  if (error) throw error

  if (!artists || artists.length === 0) {
    console.log('All artists already have a popularity score.')
    return
  }

  for (const artist of artists) {
    await delay(250)
    let { wikidata_id: wikidataId } = artist
    if (!wikidataId) {
      wikidataId = await searchWikidataId(artist.name)
    }
    console.log(`artist ${artist.name} -> wikidata ${wikidataId || 'missing'}`)
    const canonicalTitle =
      (await getEnglishWikiTitleFromId(wikidataId)) ||
      (await searchWikipediaTitle(artist.name))
    const extractLines = await fetchWikiExtractLength(canonicalTitle)
    const avgViews = await fetchPageViews(canonicalTitle)
    const sitelinks = await fetchSitelinkCount(wikidataId)
    const museumCount = await fetchMuseumPresence(wikidataId)

    const score = calculateScore({
      artistName: artist.name,
      hasWiki: Boolean(canonicalTitle),
      extractLines,
      avgViews,
      museumCount,
      sitelinks,
    })

    console.log(
      `${artist.name} -> score ${score} (wiki:${canonicalTitle || 'none'} views:${avgViews.toFixed(
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
