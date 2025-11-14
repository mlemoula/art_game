// generate_daily_art.js
// Requires: npm install node-fetch csv-parse csv-stringify

import fs from 'fs'
import fetch from 'node-fetch'
import { parse } from 'csv-parse/sync'
import { stringify } from 'csv-stringify/sync'

// -------------------------------
// Config
// -------------------------------

const ARTISTS_CSV = './artists_rows.csv'
const OUTPUT_CSV = './artworks_generated.csv'
const TARGET_COUNT = 200

// Fame threshold for “very known artists”
const FAME_THRESHOLD = 92

// -------------------------------
// Utils
// -------------------------------

const wait = (ms) => new Promise((res) => setTimeout(res, ms))

const wikidataAPI = (query) =>
  `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(
    query
  )}`

const normalizeName = (name = '') => name.trim().toLowerCase()

// Transform Wikimedia file URL to full-res
function toFullImage(url) {
  if (!url) return null
  return url.replace('/thumb/', '/').replace(/\/\d+px-.+$/, '')
}

// -------------------------------
// Wikidata Query Builder
// -------------------------------

function buildWikidataQuery(artistLabel, limit = 10) {
  return `
SELECT ?item ?itemLabel ?creatorLabel ?image ?inception ?museumLabel ?article WHERE {
  ?item wdt:P31 wd:Q3305213.     # is a painting
  ?item wdt:P170 ?creator.       # creator
  ?creator rdfs:label "${artistLabel}"@en.

  OPTIONAL { ?item wdt:P18 ?image. }
  OPTIONAL { ?item wdt:P571 ?inception. }
  OPTIONAL {
    ?item wdt:P195 ?museum.
    ?museum rdfs:label ?museumLabel FILTER (lang(?museumLabel) = "en").
  }
  OPTIONAL {
    ?article schema:about ?item ;
             schema:inLanguage "en";
             schema:isPartOf <https://en.wikipedia.org/>.
  }

  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT ${limit}
`
}

// -------------------------------
// Load Artists from CSV
// -------------------------------

function loadArtists() {
  const raw = fs.readFileSync(ARTISTS_CSV, 'utf8')
  const entries = parse(raw, {
    columns: true,
    skip_empty_lines: true,
  })
  const artistSet = new Set(entries.map((a) => normalizeName(a.name)))
  return { entries, artistSet }
}

// -------------------------------
// Fetch Artworks for an Artist
// -------------------------------

async function fetchArtworks(artist) {
  const query = buildWikidataQuery(artist.name, 15)

  await wait(200) // rate limit safe for WDQS

  const res = await fetch(wikidataAPI(query), {
    headers: { 'User-Agent': 'Daily-Art-Generator/1.0' },
  })

  if (!res.ok) return []

  const json = await res.json()
  const rows = json?.results?.bindings ?? []

  return rows.map((r) => ({
    title: r.itemLabel?.value || null,
    image_url: toFullImage(r.image?.value || null),
    year: r.inception?.value ? r.inception.value.substring(0, 4) : null,
    museum: r.museumLabel?.value || null,
    wiki_summary_url: r.article?.value || null,
    meta_json: JSON.stringify(r),
  }))
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

function isValidArtwork(artwork, artistSet, artistName) {
  const issues = []
  if (!artwork.image_url?.startsWith('http')) issues.push('image_url')
  if (!artwork.title) issues.push('title')
  if (!artistSet.has(normalizeName(artistName))) issues.push('artist missing in catalog')
  if (!artwork.year) issues.push('year')
  if (!artwork.museum) issues.push('museum')
  if (!artwork.meta_json) issues.push('meta_json')
  if (!artwork.wiki_summary_url) issues.push('wiki_summary_url')
  return { ok: issues.length === 0, issues }
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
  const { entries: artists, artistSet } = loadArtists()

  const result = []
  let idx = 1

  for (const artist of artists) {
    if (result.length >= TARGET_COUNT) break

    const artworksRaw = await fetchArtworks(artist)

    const artworks = artworksRaw
      .map((art) => fillFromMeta({ ...art }))
      .map((art) => ({ ...art, artist: artist.name }))
      .filter((art) => {
        const { ok, issues } = isValidArtwork(art, artistSet, artist.name)
        if (!ok) {
          console.warn(
            `Skipping artwork for ${artist.name}: ${issues.join(', ')}`
          )
        }
        return ok
      })

    if (!artworks.length) continue

    const chosen = pickArtwork(artist, artworks)
    if (!chosen) continue

    result.push({
      id: idx++,
      date: "", // you fill date later when scheduling daily items
      image_url: chosen.image_url,
      title: chosen.title,
      artist: artist.name,
      year: chosen.year,
      museum: chosen.museum,
      wiki_summary_url: chosen.wiki_summary_url,
      meta_json: chosen.meta_json,
    })
  }

  const csv = stringify(result, {
    header: true,
  })

  fs.writeFileSync(OUTPUT_CSV, csv)

  console.log(`✅ Generated ${result.length} artworks → ${OUTPUT_CSV}`)
}

// -------------------------------

generate()
