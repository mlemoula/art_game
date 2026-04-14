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
const PARTIAL_OUTPUT_CSV = './artworks_generated.partial.csv'
const PROGRESS_JSON = './.generate_daily_art.progress.json'
const DEFAULT_TARGET_COUNT = 200

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
const IMAGE_PROBE_DELAY = 180
const IMAGE_PROBE_MAX_ATTEMPTS = 4
const IMAGE_PROBE_BASE_BACKOFF_MS = 1200
const IMAGE_PROBE_RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])
const WIKIDATA_FETCH_DELAY = 200
const WIKIDATA_FETCH_MAX_ATTEMPTS = 4
const WIKIDATA_FETCH_BASE_BACKOFF_MS = 1500
const WIKIDATA_RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])
const PROGRESS_STATE_VERSION = 2

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

const writeOutputCsv = (rows, filePath = OUTPUT_CSV) => {
  const csv = stringify(rows, {
    header: true,
  })
  fs.writeFileSync(filePath, csv)
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

function loadProgressState() {
  if (!fs.existsSync(PROGRESS_JSON)) return null

  try {
    const raw = fs.readFileSync(PROGRESS_JSON, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed?.version !== PROGRESS_STATE_VERSION) return null
    if (!Array.isArray(parsed.result)) return null
    if (!Array.isArray(parsed.processedArtists)) return null
    if (!Array.isArray(parsed.baseExistingArtworkKeys)) return null
    if (!parsed.runConfig || typeof parsed.runConfig !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

function saveProgressState({
  result,
  processedArtists,
  baseExistingArtworkKeys,
  totalArtists,
  runConfig,
}) {
  const payload = {
    version: PROGRESS_STATE_VERSION,
    targetCount: runConfig.targetCount,
    totalArtists,
    result,
    processedArtists: Array.from(processedArtists),
    baseExistingArtworkKeys: Array.from(baseExistingArtworkKeys),
    runConfig,
    updatedAt: new Date().toISOString(),
  }
  fs.writeFileSync(PROGRESS_JSON, JSON.stringify(payload, null, 2))
  writeOutputCsv(result, PARTIAL_OUTPUT_CSV)
}

function clearProgressState() {
  if (fs.existsSync(PROGRESS_JSON)) {
    fs.unlinkSync(PROGRESS_JSON)
  }
  if (fs.existsSync(PARTIAL_OUTPUT_CSV)) {
    fs.unlinkSync(PARTIAL_OUTPUT_CSV)
  }
}

function hasFlag(flag) {
  return process.argv.includes(flag)
}

function getArgValue(flag) {
  const index = process.argv.indexOf(flag)
  if (index === -1) return null
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) return null
  return value
}

function parseTargetCount() {
  const raw = getArgValue('--count')
  if (!raw) return DEFAULT_TARGET_COUNT
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid --count value "${raw}". Expected a positive integer.`)
  }
  return parsed
}

function parseArtistFilter() {
  const raw = getArgValue('--artist')
  return raw ? raw.trim() || null : null
}

// -------------------------------
// Fetch Artworks for an Artist
// -------------------------------

async function fetchArtworks(artist) {
  const query = buildWikidataQuery(artist, 15)
  const endpoint = wikidataAPI(query)
  let response = null
  let lastError = null

  for (let attempt = 0; attempt < WIKIDATA_FETCH_MAX_ATTEMPTS; attempt += 1) {
    await wait(WIKIDATA_FETCH_DELAY)

    try {
      response = await fetch(endpoint, {
        headers: { 'User-Agent': 'Daily-Art-Generator/1.0' },
      })

      if (response.ok) {
        lastError = null
        break
      }

      const shouldRetry = WIKIDATA_RETRYABLE_STATUSES.has(response.status)
      if (!shouldRetry || attempt === WIKIDATA_FETCH_MAX_ATTEMPTS - 1) {
        return []
      }

      const retryAfterHeader = response.headers.get('retry-after')
      const retryAfterSeconds = Number.parseFloat(retryAfterHeader || '')
      const retryDelay = Number.isFinite(retryAfterSeconds)
        ? Math.max(0, retryAfterSeconds * 1000)
        : WIKIDATA_FETCH_BASE_BACKOFF_MS * (attempt + 1)

      console.warn(
        `   Wikidata rate-limited for ${artist.name} (status ${response.status}), retrying...`
      )
      await wait(retryDelay)
    } catch (error) {
      lastError = error
      const code = error?.code || error?.errno || ''
      const shouldRetry =
        code === 'ECONNRESET' ||
        code === 'ETIMEDOUT' ||
        code === 'ENOTFOUND' ||
        code === 'EAI_AGAIN'

      if (!shouldRetry || attempt === WIKIDATA_FETCH_MAX_ATTEMPTS - 1) {
        break
      }

      console.warn(
        `   Wikidata request failed for ${artist.name} (${code || 'network error'}), retrying...`
      )
      await wait(WIKIDATA_FETCH_BASE_BACKOFF_MS * (attempt + 1))
    }
  }

  if (!response?.ok) {
    if (lastError) throw lastError
    return []
  }

  const json = await response.json()
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
  } catch (error) {
    console.warn('⚠️  Invalid meta_json, cannot enrich artwork', error)
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

  await wait(IMAGE_PROBE_DELAY)

  let lastStatus = null
  let ok = false

  for (let attempt = 0; attempt < IMAGE_PROBE_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Daily-Art-Generator/1.0',
          Range: 'bytes=0-0',
        },
      })

      if (response.ok) {
        ok = true
        break
      }

      lastStatus = response.status
      const shouldRetry = IMAGE_PROBE_RETRYABLE_STATUSES.has(response.status)
      if (!shouldRetry || attempt === IMAGE_PROBE_MAX_ATTEMPTS - 1) {
        break
      }

      const retryAfterHeader = response.headers.get('retry-after')
      const retryAfterSeconds = Number.parseFloat(retryAfterHeader || '')
      const retryDelay = Number.isFinite(retryAfterSeconds)
        ? Math.max(0, retryAfterSeconds * 1000)
        : IMAGE_PROBE_BASE_BACKOFF_MS * (attempt + 1)

      await wait(retryDelay)
    } catch {
      lastStatus = null
      if (attempt === IMAGE_PROBE_MAX_ATTEMPTS - 1) break
      await wait(IMAGE_PROBE_BASE_BACKOFF_MS * (attempt + 1))
    }
  }

  if (!ok && lastStatus === 429) {
    console.warn(`   Probe rate-limited for ${url}`)
  }

  imageProbeCache.set(url, ok)
  return ok
}

// -------------------------------
// Selection Logic Based on Fame
// -------------------------------

function rankArtworksForArtist(artist, artworks) {
  if (artworks.length === 0) return []

  // Lesser-known artists: keep the natural popularity ranking from Wikidata.
  if (artist.fame_index < FAME_THRESHOLD) {
    return artworks
  }

  // Very famous artists: bias toward mid-popularity works first, then fall back.
  const ranked = []
  const preferredIndices = [3, 2, 4, 1, 0]
  const usedIndices = new Set()

  preferredIndices.forEach((index) => {
    if (!artworks[index]) return
    ranked.push(artworks[index])
    usedIndices.add(index)
  })

  artworks.forEach((artwork, index) => {
    if (usedIndices.has(index)) return
    ranked.push(artwork)
  })

  return ranked
}

// -------------------------------
// Main
// -------------------------------

async function generate() {
  if (hasFlag('--reset-progress')) {
    clearProgressState()
    console.log('Cleared generator progress state.')
  }

  const targetCount = parseTargetCount()
  const artistFilter = parseArtistFilter()
  const runConfig = {
    targetCount,
    artistFilter: artistFilter ? normalizeName(artistFilter) : null,
  }

  const { entries: allArtists, artistSet } = await loadArtists()
  const artists = artistFilter
    ? allArtists.filter(
        (artist) => normalizeName(artist.name) === normalizeName(artistFilter)
      )
    : allArtists

  if (artistFilter && !artists.length) {
    throw new Error(`Artist "${artistFilter}" was not found in the loaded catalog.`)
  }

  const rawProgressState = loadProgressState()
  const progressState =
    rawProgressState &&
    rawProgressState.runConfig?.targetCount === runConfig.targetCount &&
    (rawProgressState.runConfig?.artistFilter || null) === runConfig.artistFilter
      ? rawProgressState
      : null
  const baseExistingArtworkKeys =
    progressState?.baseExistingArtworkKeys?.length
      ? new Set(progressState.baseExistingArtworkKeys)
      : ENFORCE_EXISTING_DEDUP
      ? loadExistingArtworkKeys()
      : new Set()
  const processedArtists = new Set(progressState?.processedArtists ?? [])
  const result = Array.isArray(progressState?.result) ? progressState.result : []
  const usedArtworkKeys = new Set(baseExistingArtworkKeys)
  result.forEach((row) => {
    const key = buildArtworkKey(row)
    if (key) usedArtworkKeys.add(key)
  })

  console.log(`Loaded ${artists.length} artists from catalog`)
  if (artistFilter) {
    console.log(`Filtering to artist: ${artistFilter}`)
  }
  if (progressState) {
    console.log(
      `Resuming previous run: ${result.length} artworks saved, ${processedArtists.size}/${artists.length} artists already processed`
    )
  }
  if (ENFORCE_EXISTING_DEDUP && baseExistingArtworkKeys.size) {
    console.log(
      `Skipping ${baseExistingArtworkKeys.size} artworks already present in ${OUTPUT_CSV}`
    )
  }

  for (const artist of artists) {
    const artistKey = normalizeName(artist.name)
    if (processedArtists.has(artistKey)) continue

    console.log(
      `→ Fetching artworks for ${artist.name} (${processedArtists.size + 1}/${artists.length})`
    )
    if (!artist.wikidata_id) {
      artist.wikidata_id = await searchWikidataId(artist.name)
      if (!artist.wikidata_id) {
        console.warn(`   No Wikidata ID found for ${artist.name}, skipping.`)
        processedArtists.add(artistKey)
        saveProgressState({
          result,
          processedArtists,
          baseExistingArtworkKeys,
          totalArtists: artists.length,
          runConfig,
        })
        continue
      }
    }
    let artworksRaw = []
    try {
      artworksRaw = await fetchArtworks(artist)
    } catch (error) {
      console.warn(
        `   Failed to fetch artworks for ${artist.name}: ${error.message || error}`
      )
      processedArtists.add(artistKey)
      saveProgressState({
        result,
        processedArtists,
        baseExistingArtworkKeys,
        totalArtists: artists.length,
        runConfig,
      })
      continue
    }
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

    if (!artworks.length) {
      processedArtists.add(artistKey)
      saveProgressState({
        result,
        processedArtists,
        baseExistingArtworkKeys,
        totalArtists: artists.length,
        runConfig,
      })
      continue
    }

    const rankedArtworks = rankArtworksForArtist(artist, artworks)
    let scheduledCandidate = null

    for (const chosen of rankedArtworks) {
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

      const exists = await imageExists(chosen.image_url)
      if (!exists) {
        console.warn(
          `   Skipping artwork for ${artist.name}: image unreachable (${chosen.image_url})`
        )
        continue
      }

      if (uniquenessKey) usedArtworkKeys.add(uniquenessKey)
      scheduledCandidate = candidate
      break
    }

    if (!scheduledCandidate) {
      console.warn(`   No schedulable artwork found for ${artist.name}`)
      processedArtists.add(artistKey)
      saveProgressState({
        result,
        processedArtists,
        baseExistingArtworkKeys,
        totalArtists: artists.length,
        runConfig,
      })
      continue
    }

    result.push(scheduledCandidate)
    processedArtists.add(artistKey)
    saveProgressState({
      result,
      processedArtists,
      baseExistingArtworkKeys,
      totalArtists: artists.length,
      runConfig,
    })
  }

  const finalResult = [...result]
  for (let i = finalResult.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[finalResult[i], finalResult[j]] = [finalResult[j], finalResult[i]]
  }

  const trimmedResult = finalResult.slice(0, targetCount)

  if (finalResult.length > targetCount) {
    console.log(
      `Collected ${finalResult.length} valid artworks across the catalog, keeping the first ${targetCount} after shuffling`
    )
  }

  writeOutputCsv(trimmedResult, OUTPUT_CSV)
  clearProgressState()

  console.log(`✅ Generated ${trimmedResult.length} artworks → ${OUTPUT_CSV}`)
}

// -------------------------------

generate()
