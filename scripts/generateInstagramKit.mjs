/**
 * generateInstagramKit.mjs
 *
 * Generates a full daily Instagram kit for Who Painted This.
 *
 * Outputs per run:
 *   post-square.jpg        — feed post (tight detail crop, most zoomed)
 *   carousel-slide-1.jpg   — tightest crop  (~22 % of image)
 *   carousel-slide-2.jpg   — medium crop    (~45 %)
 *   carousel-slide-3.jpg   — wider crop     (~72 %)
 *   carousel-slide-4.jpg   — full image + CTA overlay
 *   story-vertical.jpg     — 9:16 story
 *   reveal-post.jpg        — J+1 reveal: full image + answer card
 *   caption.txt            — feed caption with hook + wiki snippet
 *   reveal-caption.txt     — J+1 caption with answer + community stats
 *   story-script.txt       — 3-frame script with sticker suggestions + quiz options
 *   hashtags.txt           — 12 rotating discovery tags
 *   reveal-hashtags.txt    — reveal tags
 *   manifest.json          — all metadata
 *
 * Usage:
 *   node scripts/generateInstagramKit.mjs [--date YYYY-MM-DD] [--offset N] [--reveal]
 *   --reveal   Generate the reveal post for the *previous* day's puzzle
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_OUTPUT_DIR = path.join(projectRoot, 'social', 'instagram')
const DEFAULT_BASE_URL = 'https://whopaintedthis.vercel.app'
const DEFAULT_BRAND_NAME = 'Who Painted This'
const POST_SIZE = 1080
const STORY_WIDTH = 1080
const STORY_HEIGHT = 1920
const STORY_ART_LEFT = 120
const STORY_ART_TOP = 410
const STORY_ART_WIDTH = 840
const STORY_ART_HEIGHT = 760

// Zoom fractions for the carousel: 22 % → 45 % → 72 % → 100 %
// Mirrors the progressive dézoom mechanic of the game.
const CAROUSEL_ZOOM_FRACTIONS = [0.22, 0.45, 0.72, 1.0]

// ─── CLI ──────────────────────────────────────────────────────────────────────

const parseArgs = (argv) => {
  const parsed = {}
  for (let i = 0; i < argv.length; i += 1) {
    const entry = argv[i]
    if (!entry.startsWith('--')) continue
    const key = entry.slice(2)
    const next = argv[i + 1]
    const hasValue = typeof next === 'string' && !next.startsWith('--')
    if (hasValue) { parsed[key] = next; i += 1 } else { parsed[key] = true }
  }
  return parsed
}

const printHelp = () => {
  console.log(`
Generate a full Instagram daily kit for the art puzzle.

Usage:
  node scripts/generateInstagramKit.mjs [--date YYYY-MM-DD] [--offset N] [--reveal]

Options:
  --date YYYY-MM-DD   Generate assets for a specific puzzle date.
  --offset N          Offset from today's UTC date. Example: --offset 1.
  --reveal            Generate the reveal post for the previous day's puzzle.
  --output DIR        Output folder root. Default: social/instagram
  --base-url URL      Public game URL. Default: ${DEFAULT_BASE_URL}
  --brand NAME        Brand name shown on assets. Default: ${DEFAULT_BRAND_NAME}
  --help              Show this message.
`)
}

const loadEnvFile = (filename) => {
  const filePath = path.join(projectRoot, filename)
  if (!fs.existsSync(filePath)) return
  const content = fs.readFileSync(filePath, 'utf8')
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const sep = trimmed.indexOf('=')
    if (sep <= 0) return
    const key = trimmed.slice(0, sep).trim()
    const raw = trimmed.slice(sep + 1).trim()
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) return
    const unquoted =
      (raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("'") && raw.endsWith("'"))
        ? raw.slice(1, -1)
        : raw
    process.env[key] = unquoted
  })
}

const ensureIsoDay = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid date "${value}". Expected YYYY-MM-DD.`)
  }
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid calendar date "${value}".`)
  }
  return value
}

const getTodayUtcKey = () => new Date().toISOString().slice(0, 10)

const resolveTargetDate = ({ date, offset }) => {
  if (date) return ensureIsoDay(date)
  const today = getTodayUtcKey()
  if (typeof offset === 'undefined') return today
  const parsedOffset = Number.parseInt(String(offset), 10)
  if (Number.isNaN(parsedOffset)) throw new Error(`Invalid offset "${offset}". Expected an integer.`)
  const shifted = new Date(`${today}T00:00:00Z`)
  shifted.setUTCDate(shifted.getUTCDate() + parsedOffset)
  return shifted.toISOString().slice(0, 10)
}

const shiftDate = (isoDate, days) => {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// ─── Text utilities ───────────────────────────────────────────────────────────

const toSentenceCase = (value) => {
  if (!value) return value
  return value.charAt(0).toUpperCase() + value.slice(1)
}

const slugify = (value) =>
  String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

const toHashtag = (value) => {
  const compact = String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())
    .join('')
  return compact ? `#${compact}` : null
}

const escapeXml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')

const wrapText = (value, maxChars) => {
  const words = String(value).split(/\s+/).filter(Boolean)
  const lines = []
  let current = ''
  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= maxChars) { current = candidate; return }
    if (current) lines.push(current)
    current = word
  })
  if (current) lines.push(current)
  return lines
}

const buildOrdinal = (value) => {
  const r10 = value % 10
  const r100 = value % 100
  if (r10 === 1 && r100 !== 11) return `${value}st`
  if (r10 === 2 && r100 !== 12) return `${value}nd`
  if (r10 === 3 && r100 !== 13) return `${value}rd`
  return `${value}th`
}

const deriveCentury = (yearValue) => {
  const n = Number.parseInt(String(yearValue ?? ''), 10)
  if (Number.isNaN(n) || n <= 0) return null
  return `${buildOrdinal(Math.floor((n - 1) / 100) + 1)} century`
}

// ─── Wikipedia ────────────────────────────────────────────────────────────────

const toWikiApiUrl = (url) => {
  try {
    const parsed = new URL(url)
    if (parsed.hostname.includes('wikipedia.org') && parsed.pathname.startsWith('/wiki/')) {
      const title = parsed.pathname.slice(6)
      const lang = parsed.hostname.split('.')[0]
      return `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${title}`
    }
  } catch {}
  return null
}

/**
 * Fetch a short Wikipedia summary for a given wiki article URL.
 * Returns an array of plain-text paragraphs (max maxParagraphs).
 */
const fetchWikiSummary = async (wikiUrl, maxParagraphs = 2) => {
  if (!wikiUrl) return []
  const apiUrl = toWikiApiUrl(wikiUrl)
  if (!apiUrl) return []
  try {
    const response = await fetch(apiUrl, { headers: { accept: 'application/json' } })
    if (!response.ok) return []
    const json = await response.json()
    const extract = typeof json.extract === 'string' ? json.extract : ''
    return extract
      .split('\n')
      .map((p) => p.replace(/\([^)]*\d{3,4}[^)]*\)/g, '').replace(/\s+/g, ' ').trim())
      .filter((p) => p.length > 40)
      .slice(0, maxParagraphs)
  } catch {
    return []
  }
}

// ─── URL helpers ──────────────────────────────────────────────────────────────

/**
 * Build a trackable puzzle URL with UTM parameters.
 * medium: 'post' | 'story' | 'carousel' | 'reveal'
 */
const buildPuzzleUrl = (baseUrl, date, medium = 'post') => {
  const params = new URLSearchParams({
    utm_source: 'instagram',
    utm_medium: medium,
    utm_campaign: 'daily',
    utm_content: date,
  })
  return `${baseUrl}/puzzle/${date}?${params.toString()}`
}

// ─── Clue builder ─────────────────────────────────────────────────────────────
//
// Priority: century → artist_initial → country → movement → generic
//
// Rationale: century and initial create narrative tension without narrowing too
// much. Movement (e.g. "Impressionist") can be a near-giveaway for popular
// styles and should be a last resort for the teaser post.

const buildClue = ({ year, artistInitial, targetProfile }) => {
  const century = deriveCentury(year)
  if (century) {
    return {
      type: 'century',
      short: `${century} artwork.`,
      text: `Clue: this artwork dates from the ${century}.`,
    }
  }

  if (artistInitial) {
    return {
      type: 'artist_initial',
      short: `Artist's name starts with ${artistInitial}.`,
      text: `Clue: the artist's name starts with "${artistInitial}".`,
    }
  }

  const country = targetProfile?.country?.trim()
  if (country) {
    return {
      type: 'country',
      short: `${country}-linked artist.`,
      text: `Clue: the artist is usually linked with ${country}.`,
    }
  }

  const movement = targetProfile?.movement?.trim()
  if (movement) {
    return {
      type: 'movement',
      short: `${toSentenceCase(movement)} vibes.`,
      text: `Clue: the artist is often associated with ${movement}.`,
    }
  }

  return {
    type: 'generic',
    short: 'Famous artwork.',
    text: 'Clue: this is a widely recognized artwork.',
  }
}

// ─── Hashtags ─────────────────────────────────────────────────────────────────
//
// Pool-based rotation keyed by date → consistent for a given day, varied across
// days. Avoids the algo penalty for posting identical tag sets every day.

const HASHTAG_POOLS = {
  branded: ['#WhoPaintedThis'],
  game: [
    '#ArtQuiz', '#GuessThePainting', '#DailyArtChallenge',
    '#ArtHistoryGame', '#DailyPuzzle', '#ArtGame', '#ArtChallenge',
  ],
  niche: [
    '#ClassicalPainting', '#MuseumCollection', '#OldMasterPainting',
    '#FineArtLovers', '#ArtConnoisseur', '#PaintingDetail',
    '#ArtHistoryNerd', '#MuseumLovers', '#ClassicArt',
  ],
  medium: [
    '#ArtHistory', '#FineArt', '#PaintingOfTheDay', '#ArtAppreciation',
    '#MuseumArt', '#ArtWorld', '#ArtLovers', '#ArtEducation',
  ],
  broad: [
    '#Art', '#Painting', '#Museum', '#Culture', '#ArtGallery', '#ArtsCulture',
  ],
}

/**
 * Deterministic sample: uses the date seed to rotate through the pool.
 * Same date always produces the same tags; different dates produce different tags.
 */
const dateSample = (arr, n, seed) => {
  const offset = seed % arr.length
  const rotated = [...arr.slice(offset), ...arr.slice(0, offset)]
  return rotated.slice(0, n)
}

const buildDiscoveryHashtags = ({ date }) => {
  const seed = date ? Number.parseInt(date.replace(/-/g, ''), 10) : Date.now()
  return [
    ...HASHTAG_POOLS.branded,
    ...dateSample(HASHTAG_POOLS.game, 3, seed),
    ...dateSample(HASHTAG_POOLS.niche, 3, seed + 7),
    ...dateSample(HASHTAG_POOLS.medium, 3, seed + 13),
    ...dateSample(HASHTAG_POOLS.broad, 2, seed + 19),
  ] // 12 tags total
}

const buildRevealHashtags = ({ artist, museum, targetProfile }) => {
  const seed = artist ? artist.charCodeAt(0) * 31 : 0
  const tags = [
    ...HASHTAG_POOLS.branded,
    toHashtag(artist),
    toHashtag(targetProfile?.movement),
    toHashtag(targetProfile?.country),
    museum && toHashtag(museum.split(',').pop()?.trim()),
    ...dateSample(HASHTAG_POOLS.niche, 2, seed),
    ...dateSample(HASHTAG_POOLS.medium, 2, seed + 5),
  ]
    .filter(Boolean)
    .filter((t) => t.length <= 32)

  return Array.from(new Set(tags)).slice(0, 12)
}

// ─── Copy builders ────────────────────────────────────────────────────────────

/**
 * Main feed caption.
 * Hook → clue → wiki snippet (if available) → engagement CTA → link-in-bio CTA → hashtags.
 * "No spoilers" removed: comments signal engagement to the algo.
 */
const buildCaption = ({ clueText, hashtags, paintingWikiSnippet }) => {
  const lines = [
    '🎨 Can you name the painter from this single detail?',
    '',
    clueText,
  ]

  if (paintingWikiSnippet) {
    lines.push('', paintingWikiSnippet)
  }

  lines.push(
    '',
    'Drop your guess below 👇',
    'New puzzle every day → link in bio.',
    '',
    hashtags.join(' ')
  )

  return lines.join('\n')
}

/**
 * Reveal caption (J+1 post).
 * Shows yesterday's answer + a wiki sentence about the artwork + community stats.
 * Drives curiosity and brings people back for today's puzzle.
 */
const buildRevealCaption = ({
  artist,
  title,
  year,
  museum,
  artistWikiSnippet,
  communityStats,
  hashtags,
}) => {
  const lines = [
    `✦ Yesterday's answer: "${title}" by ${artist}${year ? ` (${year})` : ''}`,
    '',
  ]

  if (museum) {
    const city = museum.split(',').map((s) => s.trim()).pop()
    if (city) lines.push(`Currently at: ${city}`, '')
  }

  if (artistWikiSnippet) {
    lines.push(artistWikiSnippet, '')
  }

  if (communityStats?.total) {
    const { total, successRate } = communityStats
    lines.push(
      `${total} ${total === 1 ? 'person' : 'people'} played · ${successRate}% found it 🎯`,
      ''
    )
  }

  lines.push(
    `🎨 Today's new puzzle is live.`,
    'Link in bio.',
    '',
    hashtags.join(' ')
  )

  return lines.join('\n')
}

/**
 * Story script with interactive sticker suggestions.
 * quizOptions: array of 3 wrong artist names to pair with the correct one.
 */
const buildStoryCopy = ({ clue, puzzleUrl, artist, quizOptions, seed }) => {
  // Build 4 quiz options in a deterministic order so reruns keep the same sticker copy.
  const combinedOptions = [artist, ...quizOptions.slice(0, 3)]
  const rotation = combinedOptions.length > 0 ? seed % combinedOptions.length : 0
  const allOptions = [
    ...combinedOptions.slice(rotation),
    ...combinedOptions.slice(0, rotation),
  ]
  const correctLetter = String.fromCharCode(65 + allOptions.indexOf(artist))

  const lines = [
    '── STORY SCRIPT ────────────────────────────────',
    '',
    'FRAME 1 — Ultra-zoomed detail (carousel-slide-1.jpg)',
    '"Can you name this artwork? 🎨"',
    '',
    '→ QUIZ STICKER — "Who painted this?"',
    ...allOptions.map(
      (name, i) =>
        `   ${String.fromCharCode(65 + i)}: ${name}${name === artist ? '  ← correct answer' : ''}`
    ),
    `   Correct answer: ${correctLetter}`,
    '',
    '─────────────────────────────────────────────────',
    '',
    'FRAME 2 — Medium zoom (carousel-slide-2.jpg)',
    `"${clue.text}"`,
    '',
    '→ POLL STICKER — "Did you spot it?"',
    '   "Yes 🎨" / "Nope 😅"',
    '',
    '─────────────────────────────────────────────────',
    '',
    'FRAME 3 — Link + CTA (story-vertical.jpg)',
    '"Play now and see how the community did 👇"',
    '',
    `→ LINK STICKER — URL: ${puzzleUrl}`,
    '   Label: "Play today\'s puzzle"',
    '→ COUNTDOWN STICKER — target: midnight UTC',
    '   (daily puzzle resets every day at midnight)',
    '',
    '─────────────────────────────────────────────────',
    '',
    'TIPS:',
    '· Post Frame 1 first, then swipe-up or replies will show who engaged.',
    '· Quiz sticker results become visible after the story expires — screenshot them.',
    '· Best posting window: 08:00–10:00 local or 18:00–20:00 local.',
  ]

  return lines.join('\n')
}

// ─── SVG overlays ─────────────────────────────────────────────────────────────

/**
 * Minimal overlay for carousel slides.
 * slideIndex 0 = tightest (question), slideIndex 3 = full (CTA).
 */
const createCarouselOverlay = ({ brandName, slideIndex, totalSlides, clueShort, date }) => {
  const slideLabel = `${slideIndex + 1} / ${totalSlides}`
  const isFirst = slideIndex === 0
  const isLast = slideIndex === totalSlides - 1

  // Bottom content varies per slide
  let bottomContent
  if (isFirst) {
    bottomContent = `
      <text x="88" y="808" font-size="82" font-family="Georgia, serif" fill="#ffffff">Can you</text>
      <text x="88" y="892" font-size="82" font-family="Georgia, serif" fill="#ffffff">name this</text>
      <text x="88" y="976" font-size="82" font-family="Georgia, serif" fill="#ffffff">artwork?</text>
    `
  } else if (isLast) {
    bottomContent = `
      <rect x="80" y="740" rx="44" ry="44" width="920" height="164" fill="#f2e8d7" />
      <text x="540" y="814" font-size="34" font-family="Arial, sans-serif" letter-spacing="4" fill="#1d1c1a" text-anchor="middle">LINK IN BIO</text>
      <text x="540" y="862" font-size="28" font-family="Arial, sans-serif" fill="#51483d" text-anchor="middle">Play today's puzzle</text>
      <text x="540" y="960" font-size="30" font-family="Georgia, serif" fill="#ffffff" text-anchor="middle">Full painting revealed</text>
    `
  } else {
    const clueLines = wrapText(clueShort, 28)
    bottomContent = `
      <rect x="88" y="748" rx="26" ry="26" width="500" height="${40 + clueLines.length * 52}" fill="rgba(20,20,24,0.62)" stroke="rgba(255,247,232,0.22)" />
      <text x="118" y="786" font-size="22" font-family="Arial, sans-serif" letter-spacing="3" fill="#d4c6af">TODAY'S CLUE</text>
      ${clueLines.map((l, i) => `<text x="108" y="${828 + i * 52}" font-size="40" font-family="Georgia, serif" fill="#fff7e8">${escapeXml(l)}</text>`).join('')}
    `
  }

  return Buffer.from(`
    <svg width="${POST_SIZE}" height="${POST_SIZE}" viewBox="0 0 ${POST_SIZE} ${POST_SIZE}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(16,16,19,0.22)" />
          <stop offset="48%" stop-color="rgba(16,16,19,0.0)" />
          <stop offset="100%" stop-color="rgba(16,16,19,0.88)" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#fade)" />
      <text x="88" y="96" font-size="28" font-family="Arial, sans-serif" letter-spacing="6" fill="#fff7e8">${escapeXml(brandName.toUpperCase())}</text>
      <text x="${POST_SIZE - 88}" y="96" font-size="24" font-family="Arial, sans-serif" letter-spacing="2" fill="rgba(255,247,232,0.55)" text-anchor="end">${escapeXml(slideLabel)}</text>
      ${bottomContent}
      <text x="88" y="${POST_SIZE - 40}" font-size="22" font-family="Arial, sans-serif" letter-spacing="2" fill="rgba(255,247,232,0.4)">${escapeXml(date)}</text>
    </svg>
  `)
}

/**
 * Overlay for the square post (same as carousel slide 1, no slide indicator).
 */
const createSquareOverlay = ({ brandName, clueShort, date }) => {
  const clueLines = wrapText(clueShort, 28)
  const clueSvg = clueLines
    .map((line, i) =>
      `<text x="88" y="${766 + i * 48}" font-size="40" font-family="Georgia, serif" fill="#fff7e8">${escapeXml(line)}</text>`
    )
    .join('')

  return Buffer.from(`
    <svg width="${POST_SIZE}" height="${POST_SIZE}" viewBox="0 0 ${POST_SIZE} ${POST_SIZE}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(16,16,19,0.16)" />
          <stop offset="55%" stop-color="rgba(16,16,19,0.02)" />
          <stop offset="100%" stop-color="rgba(16,16,19,0.86)" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#fade)" />
      <text x="88" y="96" font-size="28" font-family="Arial, sans-serif" letter-spacing="6" fill="#fff7e8">${escapeXml(brandName.toUpperCase())}</text>
      <text x="88" y="168" font-size="82" font-family="Georgia, serif" fill="#ffffff">Can you</text>
      <text x="88" y="252" font-size="82" font-family="Georgia, serif" fill="#ffffff">name this</text>
      <text x="88" y="336" font-size="82" font-family="Georgia, serif" fill="#ffffff">artwork?</text>
      <rect x="88" y="680" rx="26" ry="26" width="460" height="${40 + clueLines.length * 52}" fill="rgba(20,20,24,0.58)" stroke="rgba(255,247,232,0.25)" />
      <text x="118" y="718" font-size="22" font-family="Arial, sans-serif" letter-spacing="3" fill="#d4c6af">TODAY'S CLUE</text>
      ${clueSvg}
      <text x="88" y="1012" font-size="22" font-family="Arial, sans-serif" letter-spacing="2" fill="rgba(255,247,232,0.5)">${escapeXml(date)}</text>
    </svg>
  `)
}

/**
 * Overlay for the story (9:16).
 */
const createStoryOverlay = ({ brandName, clueText, date }) => {
  const clueLines = wrapText(clueText, 28)
  const clueSvg = clueLines
    .map((line, i) =>
      `<text x="116" y="${1312 + i * 50}" font-size="40" font-family="Georgia, serif" fill="#fff7e8">${escapeXml(line)}</text>`
    )
    .join('')

  return Buffer.from(`
    <svg width="${STORY_WIDTH}" height="${STORY_HEIGHT}" viewBox="0 0 ${STORY_WIDTH} ${STORY_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(15,15,18,0.22)" />
          <stop offset="100%" stop-color="rgba(15,15,18,0.78)" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)" />
      <text x="96" y="124" font-size="32" font-family="Arial, sans-serif" letter-spacing="6" fill="#fff7e8">${escapeXml(brandName.toUpperCase())}</text>
      <text x="96" y="218" font-size="88" font-family="Georgia, serif" fill="#ffffff">Can you</text>
      <text x="96" y="310" font-size="88" font-family="Georgia, serif" fill="#ffffff">name this</text>
      <text x="96" y="402" font-size="88" font-family="Georgia, serif" fill="#ffffff">artwork?</text>
      <rect x="80" y="1210" rx="30" ry="30" width="920" height="${98 + clueLines.length * 54}" fill="rgba(20,20,24,0.66)" stroke="rgba(255,247,232,0.22)" />
      <text x="116" y="1270" font-size="24" font-family="Arial, sans-serif" letter-spacing="4" fill="#d4c6af">TODAY'S CLUE</text>
      ${clueSvg}
      <rect x="80" y="1540" rx="44" ry="44" width="920" height="184" fill="#f2e8d7" />
      <text x="540" y="1628" font-size="34" font-family="Arial, sans-serif" letter-spacing="3" fill="#1d1c1a" text-anchor="middle">TAP THE LINK STICKER</text>
      <text x="540" y="1676" font-size="26" font-family="Arial, sans-serif" fill="#51483d" text-anchor="middle">Play today's puzzle</text>
      <text x="96" y="1848" font-size="26" font-family="Arial, sans-serif" letter-spacing="2" fill="#fff7e8">${escapeXml(date)}</text>
    </svg>
  `)
}

/**
 * Overlay for the reveal post (J+1).
 * Shows the answer card on the full painting.
 */
const createRevealOverlay = ({ brandName, artist, title, year, museum, date }) => {
  const artistLines = wrapText(artist, 24)
  const titleLines = wrapText(title || 'Untitled', 30)
  const museumCity = museum ? museum.split(',').map((s) => s.trim()).pop() : null
  const metaLine = [year, museumCity].filter(Boolean).join(' · ')
  const cardTop = 690
  const cardHeight = 390
  const labelY = cardTop + 54
  const artistStartY = cardTop + 138
  const artistLineHeight = 82
  const titleStartY = artistStartY + artistLines.length * artistLineHeight + 56
  const titleLineHeight = 46
  const metaY = titleStartY + titleLines.length * titleLineHeight + 44

  const artistSvg = artistLines
    .map((line, i) =>
      `<text x="540" y="${artistStartY + i * artistLineHeight}" font-size="72" font-family="Georgia, serif" fill="#ffffff" text-anchor="middle">${escapeXml(line)}</text>`
    )
    .join('')
  const titleSvg = titleLines
    .map((line, i) =>
      `<text x="540" y="${titleStartY + i * titleLineHeight}" font-size="38" font-family="Georgia, serif" fill="rgba(255,247,232,0.82)" text-anchor="middle" font-style="italic">${escapeXml(line)}</text>`
    )
    .join('')

  return Buffer.from(`
    <svg width="${POST_SIZE}" height="${POST_SIZE}" viewBox="0 0 ${POST_SIZE} ${POST_SIZE}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(10,10,12,0.12)" />
          <stop offset="40%" stop-color="rgba(10,10,12,0.05)" />
          <stop offset="100%" stop-color="rgba(10,10,12,0.92)" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#fade)" />
      <text x="88" y="96" font-size="28" font-family="Arial, sans-serif" letter-spacing="6" fill="#fff7e8">${escapeXml(brandName.toUpperCase())}</text>
      <text x="${POST_SIZE - 88}" y="96" font-size="24" font-family="Arial, sans-serif" letter-spacing="3" fill="rgba(255,247,232,0.55)" text-anchor="end">YESTERDAY'S ANSWER</text>
      <rect x="0" y="${cardTop}" width="${POST_SIZE}" height="${cardHeight}" fill="rgba(12,12,14,0.72)" />
      <text x="540" y="${labelY}" font-size="20" font-family="Arial, sans-serif" letter-spacing="6" fill="#d4c6af" text-anchor="middle">THE ARTIST WAS</text>
      ${artistSvg}
      ${titleSvg}
      ${metaLine ? `<text x="540" y="${metaY}" font-size="24" font-family="Arial, sans-serif" fill="rgba(255,247,232,0.5)" text-anchor="middle">${escapeXml(metaLine)}</text>` : ''}
      <text x="88" y="${POST_SIZE - 40}" font-size="22" font-family="Arial, sans-serif" letter-spacing="2" fill="rgba(255,247,232,0.4)">${escapeXml(date)}</text>
    </svg>
  `)
}

// ─── Image asset builders ─────────────────────────────────────────────────────

/**
 * Get a normalized (EXIF-rotated) buffer + metadata.
 * Call once per run to avoid repeating the rotation pass.
 */
const normalizeImage = async (imageBuffer) => {
  const rotated = await sharp(imageBuffer).rotate().toBuffer()
  const meta = await sharp(rotated).metadata()
  return { buffer: rotated, width: meta.width, height: meta.height }
}

/**
 * Build a square crop at a given zoom fraction.
 * zoomFraction < 1 → extract center of that fraction, then resize to POST_SIZE.
 * zoomFraction = 1 → full image, smart crop to square.
 */
const buildSquareCrop = async ({ normalizedImage, zoomFraction, overlayBuffer, outputPath }) => {
  const { buffer, width, height } = normalizedImage
  let pipeline

  if (zoomFraction >= 1.0) {
    pipeline = sharp(buffer).resize(POST_SIZE, POST_SIZE, { fit: 'cover', position: 'attention' })
  } else {
    const cropW = Math.round(width * zoomFraction)
    const cropH = Math.round(height * zoomFraction)
    const left = Math.max(0, Math.round((width - cropW) / 2))
    const top = Math.max(0, Math.round((height - cropH) / 2))
    pipeline = sharp(buffer)
      .extract({ left, top, width: Math.min(cropW, width - left), height: Math.min(cropH, height - top) })
      .resize(POST_SIZE, POST_SIZE, { fit: 'cover' })
  }

  const finalBuffer = await pipeline
    .modulate({ brightness: 0.94, saturation: 1.03 })
    .composite(overlayBuffer ? [{ input: overlayBuffer }] : [])
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer()

  fs.writeFileSync(outputPath, finalBuffer)
}

/**
 * Build the 9:16 story: blurred full background + centered artwork card + overlay.
 */
const buildStoryAsset = async ({ normalizedImage, overlayBuffer, outputPath }) => {
  const { buffer } = normalizedImage

  const background = await sharp(buffer)
    .resize(STORY_WIDTH, STORY_HEIGHT, { fit: 'cover', position: 'attention' })
    .blur(16)
    .modulate({ brightness: 0.7, saturation: 0.92 })
    .toBuffer()

  const card = await sharp(buffer)
    .resize(STORY_ART_WIDTH, STORY_ART_HEIGHT, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer()

  const finalBuffer = await sharp(background)
    .composite([
      {
        input: Buffer.from(`
          <svg width="${STORY_WIDTH}" height="${STORY_HEIGHT}" viewBox="0 0 ${STORY_WIDTH} ${STORY_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
            <rect x="${STORY_ART_LEFT}" y="${STORY_ART_TOP}" width="${STORY_ART_WIDTH}" height="${STORY_ART_HEIGHT}" rx="32" ry="32" fill="rgba(10,10,12,0.22)" />
          </svg>
        `),
      },
      { input: card, left: STORY_ART_LEFT, top: STORY_ART_TOP },
      { input: overlayBuffer },
    ])
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer()

  fs.writeFileSync(outputPath, finalBuffer)
}

// ─── Data fetchers ────────────────────────────────────────────────────────────

const fetchArtworkData = async ({ supabase, date }) => {
  const selectWithArtistInitial =
    'id, date, title, artist, year, museum, image_url, cached_image_url, wiki_summary_url, wiki_artist_summary_url, artist_initial'
  const selectWithoutArtistInitial =
    'id, date, title, artist, year, museum, image_url, cached_image_url, wiki_summary_url, wiki_artist_summary_url'

  let { data, error } = await supabase
    .from('daily_art')
    .select(selectWithArtistInitial)
    .eq('date', date)
    .maybeSingle()

  if (
    error &&
    error.message &&
    error.message.includes('artist_initial')
  ) {
    const fallbackResult = await supabase
      .from('daily_art')
      .select(selectWithoutArtistInitial)
      .eq('date', date)
      .maybeSingle()
    data = fallbackResult.data
    error = fallbackResult.error
  }

  if (error) throw new Error(`Unable to load daily artwork: ${error.message}`)
  if (!data) throw new Error(`No puzzle found for ${date}.`)

  return {
    id: data.id,
    date: data.date,
    title: data.title,
    artist: data.artist,
    year: data.year,
    museum: data.museum,
    imageUrl: data.cached_image_url || data.image_url,
    wikiSummaryUrl: data.wiki_summary_url,
    wikiArtistSummaryUrl: data.wiki_artist_summary_url,
    artistInitial:
      typeof data.artist_initial === 'string' ? data.artist_initial : null,
  }
}

const fetchArtistProfile = async ({ supabase, artist }) => {
  if (!artist) return null
  const { data, error } = await supabase
    .from('artists')
    .select('movement, country, birth_year, death_year, popularity_score')
    .ilike('name', artist)
    .maybeSingle()
  if (error) throw new Error(`Unable to load artist profile: ${error.message}`)
  return data
    ? {
        movement: data.movement,
        country: data.country,
        birthYear: data.birth_year,
        deathYear: data.death_year,
        popularityScore: data.popularity_score,
      }
    : null
}

/**
 * Fetch 3 random wrong artists for the Story quiz sticker.
 * Samples from the top-100 most popular artists, excluding the target.
 */
const fetchWrongArtists = async ({ supabase, targetArtist, limit = 3 }) => {
  try {
    const { data } = await supabase
      .from('artists')
      .select('name')
      .not('name', 'ilike', targetArtist)
      .order('popularity_score', { ascending: false })
      .limit(60)

    if (!data || data.length === 0) return []

    // Deterministically shuffle using artist name as seed
    const seed = targetArtist.charCodeAt(0) * 31 + targetArtist.charCodeAt(1)
    const shuffled = [...data].sort((a, b) => {
      const ha = (seed + a.name.charCodeAt(0) * 17) % data.length
      const hb = (seed + b.name.charCodeAt(0) * 17) % data.length
      return ha - hb
    })

    return shuffled.slice(0, limit).map((r) => r.name)
  } catch {
    return []
  }
}

/**
 * Fetch community stats for the reveal post (played count + success rate).
 */
const fetchCommunityStats = async ({ supabase, artworkId }) => {
  if (!artworkId) return null
  try {
    const { data, count } = await supabase
      .from('plays')
      .select('success', { count: 'exact' })
      .eq('daily_id', artworkId)

    if (!data || !count) return null
    const successCount = data.filter((r) =>
      ['true', '1', 't', true, 1].includes(r.success)
    ).length
    return {
      total: count,
      successRate: Math.round((successCount / count) * 100),
    }
  } catch {
    return null
  }
}

const downloadImageBuffer = async (imageUrl) => {
  const response = await fetch(imageUrl)
  if (!response.ok) {
    throw new Error(`Unable to download artwork image: ${response.status} ${response.statusText}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

// ─── File helpers ─────────────────────────────────────────────────────────────

const writeTextFile = (filePath, content) => {
  fs.writeFileSync(filePath, `${content.trim()}\n`, 'utf8')
}

const createOutputDir = (rootDir, date) => {
  const finalDir = path.join(rootDir, date)
  fs.mkdirSync(finalDir, { recursive: true })
  return finalDir
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const main = async () => {
  loadEnvFile('.env.local')
  loadEnvFile('.env')

  const args = parseArgs(process.argv.slice(2))
  if (args.help) { printHelp(); return }

  const outputRoot = path.resolve(projectRoot, args.output || DEFAULT_OUTPUT_DIR)
  const baseUrl = String(args['base-url'] || DEFAULT_BASE_URL).replace(/\/+$/, '')
  const brandName = String(args.brand || DEFAULT_BRAND_NAME).trim() || DEFAULT_BRAND_NAME
  const isReveal = Boolean(args.reveal)
  const date = resolveTargetDate({ date: args.date, offset: args.offset })

  // When --reveal is used, the reveal post is for `date` (yesterday's puzzle).
  // The "today" puzzle URL in the reveal caption points to date+1.
  const revealDate = isReveal ? date : shiftDate(date, -1)
  const todayDate = isReveal ? shiftDate(date, 1) : date

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in the environment.')
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  // ── Load puzzle data ──────────────────────────────────────────────────────

  const artwork = await fetchArtworkData({ supabase, date: isReveal ? revealDate : date })
  const targetProfile = await fetchArtistProfile({ supabase, artist: artwork.artist })
  const artistInitial =
    artwork.artistInitial?.trim().charAt(0).toUpperCase() ||
    (typeof artwork.artist === 'string' && artwork.artist.trim()
      ? artwork.artist.trim().charAt(0).toUpperCase()
      : null)

  // ── Wiki content ──────────────────────────────────────────────────────────

  const [paintingWikiParagraphs, artistWikiParagraphs] = await Promise.all([
    fetchWikiSummary(artwork.wikiSummaryUrl, 1),
    fetchWikiSummary(
      artwork.wikiArtistSummaryUrl ||
        (artwork.artist
          ? `https://en.wikipedia.org/wiki/${encodeURIComponent(artwork.artist.replace(/\s+/g, '_'))}`
          : null),
      1
    ),
  ])

  const paintingWikiSnippet = paintingWikiParagraphs[0] || null
  const artistWikiSnippet = artistWikiParagraphs[0] || null

  // ── Content ───────────────────────────────────────────────────────────────

  const clue = buildClue({
    year: artwork.year,
    artistInitial,
    targetProfile: targetProfile
      ? { movement: targetProfile.movement, country: targetProfile.country }
      : null,
  })

  const postUrl = buildPuzzleUrl(baseUrl, isReveal ? todayDate : date, 'post')
  const storyUrl = buildPuzzleUrl(baseUrl, isReveal ? todayDate : date, 'story')
  const todayPostUrl = buildPuzzleUrl(baseUrl, todayDate, 'post')

  const discoveryHashtags = buildDiscoveryHashtags({ date })
  const revealHashtags = buildRevealHashtags({
    artist: artwork.artist,
    museum: artwork.museum,
    targetProfile: targetProfile
      ? { movement: targetProfile.movement, country: targetProfile.country }
      : null,
  })

  // ── Community stats (for reveal post) ─────────────────────────────────────

  const communityStats = isReveal
    ? await fetchCommunityStats({ supabase, artworkId: artwork.id })
    : null

  // ── Wrong artists for story quiz sticker ──────────────────────────────────

  const quizOptions = await fetchWrongArtists({ supabase, targetArtist: artwork.artist })

  // ── Output directory ──────────────────────────────────────────────────────

  const outputDir = createOutputDir(outputRoot, date)
  const imageBuffer = await downloadImageBuffer(artwork.imageUrl)
  const normalizedImage = await normalizeImage(imageBuffer)

  // ── File paths ────────────────────────────────────────────────────────────

  const postImagePath = path.join(outputDir, 'post-square.jpg')
  const storyImagePath = path.join(outputDir, 'story-vertical.jpg')
  const revealPostPath = path.join(outputDir, 'reveal-post.jpg')
  const carouselPaths = CAROUSEL_ZOOM_FRACTIONS.map(
    (_, i) => path.join(outputDir, `carousel-slide-${i + 1}.jpg`)
  )
  const captionPath = path.join(outputDir, 'caption.txt')
  const revealCaptionPath = path.join(outputDir, 'reveal-caption.txt')
  const storyCopyPath = path.join(outputDir, 'story-script.txt')
  const hashtagsPath = path.join(outputDir, 'hashtags.txt')
  const revealHashtagsPath = path.join(outputDir, 'reveal-hashtags.txt')
  const manifestPath = path.join(outputDir, 'manifest.json')

  // ── Build image assets ────────────────────────────────────────────────────

  // Square post: tightest crop (22 % of image) — preserves the mystery of the game
  await buildSquareCrop({
    normalizedImage,
    zoomFraction: CAROUSEL_ZOOM_FRACTIONS[0],
    overlayBuffer: createSquareOverlay({ brandName, clueShort: clue.short, date }),
    outputPath: postImagePath,
  })

  // Carousel slides: 4 progressive zooms
  for (let i = 0; i < CAROUSEL_ZOOM_FRACTIONS.length; i++) {
    await buildSquareCrop({
      normalizedImage,
      zoomFraction: CAROUSEL_ZOOM_FRACTIONS[i],
      overlayBuffer: createCarouselOverlay({
        brandName,
        slideIndex: i,
        totalSlides: CAROUSEL_ZOOM_FRACTIONS.length,
        clueShort: clue.short,
        date,
      }),
      outputPath: carouselPaths[i],
    })
  }

  // Story
  await buildStoryAsset({
    normalizedImage,
    overlayBuffer: createStoryOverlay({
      brandName,
      clueText: clue.text.replace(/^Clue:\s*/i, ''),
      date,
    }),
    outputPath: storyImagePath,
  })

  // Reveal post: full image + answer card overlay
  await buildSquareCrop({
    normalizedImage,
    zoomFraction: 1.0,
    overlayBuffer: createRevealOverlay({
      brandName,
      artist: artwork.artist,
      title: artwork.title,
      year: artwork.year,
      museum: artwork.museum,
      date: isReveal ? revealDate : date,
    }),
    outputPath: revealPostPath,
  })

  // ── Write copy files ──────────────────────────────────────────────────────

  writeTextFile(
    captionPath,
    buildCaption({
      clueText: clue.text,
      hashtags: discoveryHashtags,
      paintingWikiSnippet,
    })
  )

  writeTextFile(
    revealCaptionPath,
    buildRevealCaption({
      artist: artwork.artist,
      title: artwork.title,
      year: artwork.year,
      museum: artwork.museum,
      artistWikiSnippet,
      communityStats,
      hashtags: revealHashtags,
    })
  )

  writeTextFile(
    storyCopyPath,
    buildStoryCopy({
      clue,
      puzzleUrl: storyUrl,
      artist: artwork.artist,
      quizOptions,
      seed: Number.parseInt((artwork.date || date).replace(/-/g, ''), 10),
    })
  )

  writeTextFile(hashtagsPath, discoveryHashtags.join(' '))
  writeTextFile(revealHashtagsPath, revealHashtags.join(' '))

  // ── Manifest ──────────────────────────────────────────────────────────────

  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        date,
        slug: slugify(`${date}-${artwork.artist}-${artwork.title}`),
        brandName,
        isReveal,
        puzzleUrls: {
          post: postUrl,
          story: storyUrl,
          today: todayPostUrl,
        },
        clue,
        copy: {
          captionFile: path.relative(projectRoot, captionPath),
          revealCaptionFile: path.relative(projectRoot, revealCaptionPath),
          storyScriptFile: path.relative(projectRoot, storyCopyPath),
          discoveryHashtags,
          revealHashtags,
          paintingWikiSnippet,
          artistWikiSnippet,
          quizOptions,
        },
        assets: {
          postImage: path.relative(projectRoot, postImagePath),
          storyImage: path.relative(projectRoot, storyImagePath),
          revealPost: path.relative(projectRoot, revealPostPath),
          carouselSlides: carouselPaths.map((p) => path.relative(projectRoot, p)),
        },
        communityStats,
        artwork: {
          id: artwork.id,
          title: artwork.title,
          artist: artwork.artist,
          year: artwork.year,
          museum: artwork.museum,
          wikiSummaryUrl: artwork.wikiSummaryUrl,
          wikiArtistSummaryUrl: artwork.wikiArtistSummaryUrl,
        },
        targetProfile,
      },
      null,
      2
    )}\n`,
    'utf8'
  )

  const relDir = path.relative(projectRoot, outputDir)
  const files = [
    'post-square.jpg',
    ...carouselPaths.map((_, i) => `carousel-slide-${i + 1}.jpg`),
    'story-vertical.jpg',
    'reveal-post.jpg',
    'caption.txt',
    'reveal-caption.txt',
    'story-script.txt',
  ]
  console.log(`\nInstagram kit ready → ${relDir}/`)
  files.forEach((f) => console.log(`  · ${f}`))
  if (paintingWikiSnippet) console.log(`\nWiki snippet loaded: "${paintingWikiSnippet.slice(0, 60)}…"`)
  if (quizOptions.length) console.log(`Quiz options (story): ${quizOptions.join(', ')}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
