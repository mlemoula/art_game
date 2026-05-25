/**
 * generateInstagramKit.mjs
 *
 * Generates a single Instagram post image + caption for the daily puzzle.
 *
 * Output:
 *   post.jpg      — 1080×1080, tightest crop with "Who painted this?" overlay
 *   caption.txt   — hook + clue + wiki snippet + CTA + 5 hashtags
 *
 * Usage:
 *   node scripts/generateInstagramKit.mjs [--date YYYY-MM-DD]
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

const POST_SIZE = 1080
const ZOOM_FRACTION = 0.22  // tightest crop — mirrors the game's starting state
const OUTPUT_DIR = path.join(projectRoot, 'social', 'instagram')
const BASE_URL = 'https://whopaintedthis.vercel.app'
const HASHTAGS = ['#WhoPaintedThis', '#ArtHistory', '#FineArt', '#Painting', '#DailyArt']

// ─── Env ──────────────────────────────────────────────────────────────────────

const loadEnv = () => {
  for (const file of ['.env.local', '.env']) {
    const p = path.join(projectRoot, file)
    if (!fs.existsSync(p)) continue
    fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach((line) => {
      const t = line.trim()
      if (!t || t.startsWith('#')) return
      const sep = t.indexOf('=')
      if (sep <= 0) return
      const key = t.slice(0, sep).trim()
      if (!key || key in process.env) return
      const val = t.slice(sep + 1).trim().replace(/^['"]|['"]$/g, '')
      process.env[key] = val
    })
  }
}

// ─── Date ─────────────────────────────────────────────────────────────────────

const getDate = () => {
  const arg = process.argv.find((a, i) => process.argv[i - 1] === '--date')
  if (arg && /^\d{4}-\d{2}-\d{2}$/.test(arg)) return arg
  return new Date().toISOString().slice(0, 10)
}

// ─── Wikipedia ────────────────────────────────────────────────────────────────

const fetchWikiSnippet = async (url) => {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (!parsed.hostname.includes('wikipedia.org')) return null
    const title = parsed.pathname.slice(6)
    const lang = parsed.hostname.split('.')[0]
    const res = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${title}`)
    if (!res.ok) return null
    const { extract } = await res.json()
    const sentence = (extract || '')
      .replace(/\([^)]*\d{3,4}[^)]*\)/g, '')
      .split('. ')[0]
      .trim()
    return sentence.length > 30 ? sentence + '.' : null
  } catch {
    return null
  }
}

// ─── Caption ──────────────────────────────────────────────────────────────────

const buildCaption = ({ clue, wikiSnippet, date }) => {
  const url = `${BASE_URL}/puzzle/${date}?utm_source=instagram&utm_medium=post`
  const lines = [
    '🎨 Can you name the painter from this detail?',
    '',
    clue,
  ]
  if (wikiSnippet) lines.push('', wikiSnippet)
  lines.push('', `Drop your guess below 👇 Play today's puzzle → link in bio.`, '', HASHTAGS.join(' '))
  return { text: lines.join('\n'), url }
}

// ─── Clue ─────────────────────────────────────────────────────────────────────

const buildClue = ({ year, artist, profile }) => {
  const n = Number.parseInt(String(year ?? ''), 10)
  if (!Number.isNaN(n) && n > 0) {
    const century = Math.floor((n - 1) / 100) + 1
    const suffix = century === 1 ? 'st' : century === 2 ? 'nd' : century === 3 ? 'rd' : 'th'
    return `Clue: ${century}${suffix}-century artwork.`
  }
  const initial = artist?.trim().charAt(0).toUpperCase()
  if (initial) return `Clue: the artist's name starts with "${initial}".`
  const country = profile?.country?.trim()
  if (country) return `Clue: the artist is associated with ${country}.`
  return 'Clue: famous artwork — harder than it looks.'
}

// ─── Overlay SVG ──────────────────────────────────────────────────────────────

const overlay = (date) => Buffer.from(`
  <svg width="${POST_SIZE}" height="${POST_SIZE}" viewBox="0 0 ${POST_SIZE} ${POST_SIZE}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="rgba(12,12,15,0.18)" />
        <stop offset="50%"  stop-color="rgba(12,12,15,0.02)" />
        <stop offset="100%" stop-color="rgba(12,12,15,0.88)" />
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)" />
    <text x="72" y="90" font-size="26" font-family="Arial, sans-serif" letter-spacing="6" fill="#fff7e8">WHO PAINTED THIS?</text>
    <text x="72" y="860" font-size="96" font-family="Georgia, serif" fill="#ffffff">Who</text>
    <text x="72" y="956" font-size="96" font-family="Georgia, serif" fill="#ffffff">painted</text>
    <text x="72" y="1022" font-size="96" font-family="Georgia, serif" fill="rgba(255,247,232,0.55)">this?</text>
    <text x="72" y="${POST_SIZE - 36}" font-size="20" font-family="Arial, sans-serif" letter-spacing="2" fill="rgba(255,247,232,0.35)">${date}</text>
  </svg>
`)

// ─── Main ─────────────────────────────────────────────────────────────────────

const main = async () => {
  loadEnv()
  const date = getDate()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  // Fetch artwork
  const { data: art, error } = await supabase
    .from('daily_art')
    .select('title, artist, year, image_url, cached_image_url, wiki_summary_url')
    .eq('date', date)
    .maybeSingle()

  if (error || !art) throw new Error(`No puzzle found for ${date}.`)

  // Fetch artist profile for clue fallback
  const { data: profile } = await supabase
    .from('artists')
    .select('country')
    .ilike('name', art.artist)
    .maybeSingle()

  // Wiki snippet
  const wikiSnippet = await fetchWikiSnippet(art.wiki_summary_url)

  const clue = buildClue({ year: art.year, artist: art.artist, profile })
  const { text: caption, url } = buildCaption({ clue, wikiSnippet, date })

  // Download image
  const imageUrl = art.cached_image_url || art.image_url
  const imgRes = await fetch(imageUrl)
  if (!imgRes.ok) throw new Error(`Failed to download image: ${imgRes.status}`)
  const imgBuffer = Buffer.from(await imgRes.arrayBuffer())

  // Build post image: tightest crop → resize to 1080×1080 → overlay
  const rotated = await sharp(imgBuffer).rotate().toBuffer()
  const { width, height } = await sharp(rotated).metadata()
  const cropW = Math.round(width * ZOOM_FRACTION)
  const cropH = Math.round(height * ZOOM_FRACTION)
  const left = Math.round((width - cropW) / 2)
  const top = Math.round((height - cropH) / 2)

  const finalBuffer = await sharp(rotated)
    .extract({ left, top, width: cropW, height: cropH })
    .resize(POST_SIZE, POST_SIZE, { fit: 'cover' })
    .modulate({ brightness: 0.93, saturation: 1.04 })
    .composite([{ input: overlay(date) }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer()

  // Write outputs
  const outDir = path.join(OUTPUT_DIR, date)
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'post.jpg'), finalBuffer)
  fs.writeFileSync(path.join(outDir, 'caption.txt'), `${caption.trim()}\n\n---\n${url}\n`, 'utf8')

  console.log(`\nInstagram kit ready → social/instagram/${date}/`)
  console.log(`  · post.jpg`)
  console.log(`  · caption.txt`)
  if (wikiSnippet) console.log(`\nWiki: "${wikiSnippet.slice(0, 70)}…"`)
  console.log(`\nCaption preview:\n${caption.slice(0, 200)}…`)
}

main().catch((e) => { console.error(e.message || e); process.exit(1) })
