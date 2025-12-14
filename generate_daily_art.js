// generate_daily_art.js
// Requires: npm install node-fetch csv-parse csv-stringify

import fs from 'fs'
import fetch from 'node-fetch'
import { parse } from 'csv-parse/sync'
import { stringify } from 'csv-stringify/sync'
import {
  normalizeName,
  normalizeImageKey,
  resolveArtistWikiSummaryUrl,
  searchWikidataId,
} from './lib/artistWikiHelper.js'

// -------------------------------
// Config
// -------------------------------

const ARTISTS_CSV = './artists_rows.csv'
const OUTPUT_CSV = './artworks_generated.csv'
const TARGET_COUNT = 200

// Fame threshold for “very known artists”
const FAME_THRESHOLD = 92
//if false : ignore ce qui a déjà été généré = n'évite pas le doublonnage d'œuvres
const ENFORCE_EXISTING_DEDUP = true

// -------------------------------
// Utils
// -------------------------------

const wait = (ms) => new Promise((res) => setTimeout(res, ms))

const wikidataAPI = (query) =>
  `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(
    query
  )}`

const imageProbeCache = new Map()

const ARTIST_WIKI_SEARCH_DELAY = 150

const writeArtistsCsv = (entries, fieldnames) => {
  const csv = stringify(entries, {
    header: true,
    columns: fieldnames,
  })
  fs.writeFileSync(ARTISTS_CSV, csv)
}

const fillMissingArtistWikiUrls = async (entries, options = {}) => {
  const { fieldnames, writeCsv = false } = options
  let modified = false
  for (const entry of entries) {
    if (hasHttpUrl(entry.wiki_artist_summary_url)) continue
    const wikiUrl = await resolveArtistWikiSummaryUrl(entry.name)
    if (wikiUrl) {
      entry.wiki_artist_summary_url = wikiUrl
      modified = true
    }
    await wait(ARTIST_WIKI_SEARCH_DELAY)
  }
  if (modified && writeCsv && fieldnames?.length) {
    writeArtistsCsv(entries, fieldnames)
  }
}

// Transform Wikimedia file URL to full-res
function toFullImage(url) {
  if (!url) return null
  const cleaned = url.replace('/thumb/', '/').replace(/\/\d+px-.+$/, '')
  return cleaned.replace(/^http:\/\//i, 'https://')
}

// -------------------------------
// Wikidata Query Builder
// -------------------------------

function buildWikidataQuery(artist, limit = 10) {
  const safeName = artist.name.replace(/"/g, '\\"')
  const usesWikidataId = Boolean(artist.wikidata_id)

  const creatorClause = usesWikidataId
    ? `  ?item wdt:P170 wd:${artist.wikidata_id}.`
    : `  ?item wdt:P170 ?creator.
  ?creator rdfs:label ?creatorLabel.
  FILTER (
    LCASE(STR(?creatorLabel)) = LCASE("${safeName}")
    && (LANG(?creatorLabel) = "en" || LANG(?creatorLabel) = "fr")
  )`

  return `
SELECT ?item ?itemLabel ?image ?inception ?museumLabel ?article ?sitelinks WHERE {
  ?item wdt:P31 wd:Q3305213.
${creatorClause}

  ?item wdt:P18 ?image.
  OPTIONAL { ?item wdt:P571 ?inception. }
  OPTIONAL {
    ?item wdt:P195 ?museum.
    ?museum rdfs:label ?museumLabel FILTER (lang(?museumLabel) = "en" || lang(?museumLabel) = "fr").
  }
  OPTIONAL { ?item wikibase:sitelinks ?sitelinksRaw. }
  BIND(IF(BOUND(?sitelinksRaw), ?sitelinksRaw, 0) AS ?sitelinks)
  ?article schema:about ?item ;
           schema:inLanguage "en";
           schema:isPartOf <https://en.wikipedia.org/>.

  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr". }
}
ORDER BY DESC(?sitelinks)
LIMIT ${limit}
`
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// -------------------------------
// Load Artists from Supabase (fallback to CSV)
// -------------------------------

async function fetchArtistsFromSupabase(includeWikiSummary = true) {
  const selectFields = includeWikiSummary
    ? 'name,popularity_score,wiki_summary_url,wikidata_id'
    : 'name,popularity_score,wikidata_id'
  const restUrl = `${SUPABASE_URL}/rest/v1/artists?select=${selectFields}&order=name.asc`
  const response = await fetch(restUrl, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  })
  if (!response.ok) {
    const body = await response.text()
    if (
      includeWikiSummary &&
      body?.includes('wiki_summary_url') &&
      (body.includes('does not exist') || body.includes('column'))
    ) {
      return fetchArtistsFromSupabase(false)
    }
    throw new Error(`Failed to load artists from Supabase: ${response.status} – ${body}`)
  }
  const rawEntries = await response.json()
  const normalized = rawEntries.map((entry) => ({
    name: entry.name,
    fame_index: Number(entry.popularity_score ?? 0),
    wikidata_id: entry.wikidata_id || null,
    wiki_artist_summary_url: includeWikiSummary ? entry.wiki_summary_url || null : null,
  }))
  await fillMissingArtistWikiUrls(normalized)
  const artistSet = new Set(normalized.map((a) => normalizeName(a.name)))
  return { entries: normalized, artistSet }
}

async function loadArtists() {
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    return fetchArtistsFromSupabase()
  }

  const raw = fs.readFileSync(ARTISTS_CSV, 'utf8')
  const lines = raw.split(/\r?\n/)
  const headerLine = lines[0] || ''
  const fieldnames = headerLine
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
  if (!fieldnames.includes('wiki_artist_summary_url')) {
    fieldnames.push('wiki_artist_summary_url')
  }
  const entries = parse(raw, {
    columns: true,
    skip_empty_lines: true,
  })
  const normalizedEntries = entries.map((entry) => ({
    ...entry,
    name: entry.name,
    fame_index: Number(entry.fame_index || entry.popularity_score || 0),
    wikidata_id: entry.wikidata_id || null,
    wiki_artist_summary_url: entry.wiki_summary_url || null,
  }))
  await fillMissingArtistWikiUrls(normalizedEntries, {
    writeCsv: true,
    fieldnames,
  })
  const artistSet = new Set(normalizedEntries.map((a) => normalizeName(a.name)))
  return { entries: normalizedEntries, artistSet }
}

const buildArtworkKey = (payload) => {
  if (!payload) return null
  const imageKey = normalizeImageKey(payload.image_url || '')
  if (imageKey) return `img::${imageKey}`
  const artist = normalizeName(payload.artist || '')
  const title = normalizeName(payload.title || '')
  if (artist && title) return `pair::${artist}::${title}`
  return null
}

function loadExistingArtworkKeys() {
  if (!fs.existsSync(OUTPUT_CSV)) return new Set()
  try {
    const raw = fs.readFileSync(OUTPUT_CSV, 'utf8')
    if (!raw.trim()) return new Set()
    const rows = parse(raw, {
      columns: true,
      skip_empty_lines: true,
    })
    const keys = new Set()
    rows.forEach((row) => {
      const key = buildArtworkKey(row)
      if (key) keys.add(key)
    })
    return keys
  } catch {
    return new Set()
  }
}

// -------------------------------
// Fetch Artworks for an Artist
// -------------------------------

async function fetchArtworks(artist) {
  const query = buildWikidataQuery(artist, 15)

  await wait(200) // rate limit safe for WDQS

  const res = await fetch(wikidataAPI(query), {
    headers: { 'User-Agent': 'Daily-Art-Generator/1.0' },
  })

  if (!res.ok) return []

  const json = await res.json()
  const rows = json?.results?.bindings ?? []

  return rows
    .map((r) => ({
      title: r.itemLabel?.value || null,
      image_url: toFullImage(r.image?.value || null),
      year: r.inception?.value ? r.inception.value.substring(0, 4) : null,
      museum: r.museumLabel?.value || null,
      wiki_summary_url: r.article?.value || null,
      meta_json: JSON.stringify(r),
      sitelinks: Number(r.sitelinks?.value || 0),
    }))
    .sort((a, b) => (b.sitelinks || 0) - (a.sitelinks || 0))
}

function fillFromMeta(artwork) {
  if (!artwork?.meta_json) return artwork
  try {
    const meta = JSON.parse(artwork.meta_json)
    if (!artwork.museum && meta.museumLabel?.value)
      artwork.museum = meta.museumLabel.value
    if (!artwork.year && meta.inception?.value)
      artwork.year = meta.inception.value.substring(0, 4)
    if (!artwork.wiki_summary_url && meta.article?.value)
      artwork.wiki_summary_url = meta.article.value
  } catch (err) {
    console.warn('⚠️  Invalid meta_json, cannot enrich artwork')
  }
  return artwork
}

function hasHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim())
}

function isValidArtwork(artwork, artistSet, artistName) {
  const issues = []
  if (!hasHttpUrl(artwork.image_url)) issues.push('image_url')
  if (!artwork.title) issues.push('title')
  if (!artistSet.has(normalizeName(artistName)))
    issues.push('artist missing in catalog')
  if (!hasHttpUrl(artwork.wiki_summary_url)) issues.push('wiki_summary_url')
  return { ok: issues.length === 0, issues }
}

async function imageExists(url) {
  if (!url) return false
  if (imageProbeCache.has(url)) return imageProbeCache.get(url)

  const probe = async (method, extraHeaders = {}) => {
    try {
      const response = await fetch(url, {
        method,
        headers: {
          'User-Agent': 'Daily-Art-Generator/1.0',
          ...extraHeaders,
        },
      })
      return response.ok
    } catch {
      return false
    }
  }

  let ok = await probe('HEAD')
  if (!ok) {
    ok = await probe('GET', { Range: 'bytes=0-0' })
  }
  imageProbeCache.set(url, ok)
  return ok
}

// -------------------------------
// Selection Logic Based on Fame
// -------------------------------

function pickArtwork(artist, artworks) {
  if (artworks.length === 0) return null

  // 1) lesser-known artists → take top #1 artwork
  if (artist.fame_index < FAME_THRESHOLD) {
    return artworks[0]
  }

  // 2) very famous → pick a mid-popularity artwork (rank 3–5)
  return artworks[3] || artworks[2] || artworks[0]
}

// -------------------------------
// Main
// -------------------------------

async function generate() {
  const { entries: artists, artistSet } = await loadArtists()
  const existingArtworkKeys = ENFORCE_EXISTING_DEDUP
    ? loadExistingArtworkKeys()
    : new Set()
  const usedArtworkKeys = new Set(existingArtworkKeys)
  console.log(`Loaded ${artists.length} artists from catalog`)
  if (ENFORCE_EXISTING_DEDUP && existingArtworkKeys.size) {
    console.log(
      `Skipping ${existingArtworkKeys.size} artworks already present in ${OUTPUT_CSV}`
    )
  }

  const result = []
  for (const artist of artists) {
    if (result.length >= TARGET_COUNT) break

    console.log(`→ Fetching artworks for ${artist.name}`)
    if (!artist.wikidata_id) {
      artist.wikidata_id = await searchWikidataId(artist.name)
      if (!artist.wikidata_id) {
        console.warn(`   No Wikidata ID found for ${artist.name}, skipping.`)
        continue
      }
    }
    const artworksRaw = await fetchArtworks(artist)
    console.log(`   Found ${artworksRaw.length} raw artworks for ${artist.name}`)

    const artworks = artworksRaw
      .map((art) => fillFromMeta({ ...art }))
      .map((art) => ({ ...art, artist: artist.name }))
      .filter((art) => {
        const { ok, issues } = isValidArtwork(art, artistSet, artist.name)
        if (!ok) {
          console.warn(
            `   Skipping artwork for ${artist.name}: ${issues.join(', ')}`
          )
        }
        return ok
      })

    console.log(`   ${artworks.length} artworks remain after validation for ${artist.name}`)

    if (!artworks.length) continue

    const chosen = pickArtwork(artist, artworks)
    if (!chosen) continue

    const exists = await imageExists(chosen.image_url)
    if (!exists) {
      console.warn(
        `   Skipping artwork for ${artist.name}: image unreachable (${chosen.image_url})`
      )
      continue
    }

    const candidate = {
      image_url: chosen.image_url,
      title: chosen.title,
      artist: artist.name,
      year: chosen.year || '',
      museum: chosen.museum || '',
      wiki_summary_url: chosen.wiki_summary_url,
      wiki_artist_summary_url: artist.wiki_artist_summary_url,
      meta_json: chosen.meta_json,
    }

    const uniquenessKey = buildArtworkKey(candidate)
    if (ENFORCE_EXISTING_DEDUP && uniquenessKey && usedArtworkKeys.has(uniquenessKey)) {
      console.warn(
        `   Skipping artwork for ${artist.name}: already scheduled elsewhere`
      )
      continue
    }
    if (uniquenessKey) usedArtworkKeys.add(uniquenessKey)

    result.push(candidate)
  }

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }

  const csv = stringify(result, {
    header: true,
  })

  fs.writeFileSync(OUTPUT_CSV, csv)

  console.log(`✅ Generated ${result.length} artworks → ${OUTPUT_CSV}`)
}

// -------------------------------

generate()
