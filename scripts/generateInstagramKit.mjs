/**
 * generateInstagramKit.mjs
 *
 * Generates one daily Instagram post:
 *   - Full painting, beautiful crop
 *   - Minimal overlay: subtle "WHO PAINTED THIS?" watermark + handle
 *   - Caption: artist + painting info (unredacted) + 3–4 hashtags
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
const ROOT = path.resolve(__dirname, '..')
const POST_SIZE = 1080
const OUT_DIR = path.join(ROOT, 'social', 'instagram')
const HANDLE = '@dailyartguess'

// ─── Env ──────────────────────────────────────────────────────────────────────

const loadEnv = () => {
  for (const f of ['.env.local', '.env']) {
    const p = path.join(ROOT, f)
    if (!fs.existsSync(p)) continue
    fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach((line) => {
      const t = line.trim()
      if (!t || t.startsWith('#')) return
      const i = t.indexOf('=')
      if (i <= 0) return
      const k = t.slice(0, i).trim()
      if (!k || k in process.env) return
      process.env[k] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')
    })
  }
}

// ─── Args ─────────────────────────────────────────────────────────────────────

const parseArgs = () => {
  const argv = process.argv.slice(2)
  const get = (flag) => { const i = argv.indexOf(flag); return i !== -1 ? argv[i + 1] : null }
  const rawDate = get('--date')
  const today = new Date().toISOString().slice(0, 10)
  const date = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : today
  return { date }
}

// ─── Wikipedia ────────────────────────────────────────────────────────────────

const fetchWikiSummary = async (url, maxSentences = 2) => {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (!parsed.hostname.includes('wikipedia.org')) return null
    const title = parsed.pathname.slice(6)
    const lang = parsed.hostname.split('.')[0]
    const res = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${title}`)
    if (!res.ok) return null
    const { extract } = await res.json()
    return (extract || '')
      .replace(/\([^)]*\d{3,4}[^)]*\)/g, '')
      .replace(/\s+/g, ' ')
      .split(/(?<=\.)\s+/)
      .slice(0, maxSentences)
      .join(' ')
      .trim() || null
  } catch { return null }
}

// ─── Hashtags ─────────────────────────────────────────────────────────────────

const toTag = (s) => {
  if (!s) return null
  const t = s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, '').trim()
    .split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('')
  return t ? `#${t}` : null
}

const buildTags = ({ artist, movement, country }) => {
  const tags = [
    '#WhoPaintedThis',
    toTag(artist?.trim().split(/\s+/).pop()), // last name only
    toTag(movement),
    toTag(country ? `${country} art` : null),
  ].filter(Boolean)
  return [...new Set(tags)].slice(0, 4)
}

// ─── Caption ──────────────────────────────────────────────────────────────────

const buildCaption = ({ artist, title, year, museum, artistSnippet, paintingSnippet, tags }) => [
  `${artist}${year ? ` — ${year}` : ''}`,
  [title ? `"${title}"` : null, museum ? museum : null].filter(Boolean).join(' · ') || null,
  ``,
  ...(artistSnippet ? [artistSnippet, ``] : []),
  ...(paintingSnippet ? [paintingSnippet, ``] : []),
  `Test your knowledge and try to guess who painted today's daily puzzle based on a small snippet of the artwork 🎨`,
  `Link in bio`,
  ``,
  tags.join(' '),
].filter(s => s !== null).join('\n')

// ─── SVG overlay ──────────────────────────────────────────────────────────────

const escXml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;')

// Subtle bottom gradient + "WHO PAINTED THIS?" + handle — no spoilers on the image
const overlay = () => Buffer.from(`
  <svg width="${POST_SIZE}" height="${POST_SIZE}" viewBox="0 0 ${POST_SIZE} ${POST_SIZE}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="55%" stop-color="rgba(0,0,0,0.00)" />
        <stop offset="100%" stop-color="rgba(0,0,0,0.55)" />
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)" />
    <text x="56" y="${POST_SIZE - 56}" font-size="17" font-family="Arial, sans-serif"
      fill="rgba(255,255,255,0.55)" letter-spacing="5"
      text-anchor="start">WHO PAINTED THIS?</text>
    <text x="${POST_SIZE - 48}" y="${POST_SIZE - 56}" font-size="17"
      font-family="Arial, sans-serif" fill="rgba(255,255,255,0.45)"
      text-anchor="end" letter-spacing="1">free daily puzzle · link in bio</text>
  </svg>
`)

// ─── Image builder ────────────────────────────────────────────────────────────

const download = async (url) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

const buildImage = async ({ imgBuffer, outputPath }) => {
  const rotated = await sharp(imgBuffer).rotate().toBuffer()
  await sharp(rotated)
    .resize(POST_SIZE, POST_SIZE, { fit: 'cover', position: 'attention' })
    .modulate({ brightness: 0.96, saturation: 1.08 })
    .composite([{ input: overlay() }])
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile(outputPath)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const main = async () => {
  loadEnv()
  const { date } = parseArgs()

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  const { data: art, error } = await sb
    .from('daily_art')
    .select('title, artist, year, museum, image_url, cached_image_url, wiki_summary_url, wiki_artist_summary_url')
    .eq('date', date)
    .maybeSingle()
  if (error || !art) throw new Error(`No puzzle found for ${date}.`)

  const { data: profile } = await sb
    .from('artists')
    .select('country, movement')
    .ilike('name', art.artist)
    .maybeSingle()

  const artistWikiUrl = art.wiki_artist_summary_url
    || `https://en.wikipedia.org/wiki/${encodeURIComponent((art.artist || '').replace(/\s+/g, '_'))}`

  const [artistSnippet, paintingSnippet] = await Promise.all([
    fetchWikiSummary(artistWikiUrl, 2),
    fetchWikiSummary(art.wiki_summary_url, 1),
  ])

  const outDir = path.join(OUT_DIR, date)
  fs.mkdirSync(outDir, { recursive: true })

  const imgBuffer = await download(art.cached_image_url || art.image_url)
  const postPath = path.join(outDir, 'post.jpg')
  const captionPath = path.join(outDir, 'caption.txt')

  const tags = buildTags({ artist: art.artist, movement: profile?.movement, country: profile?.country })
  const caption = buildCaption({
    artist: art.artist,
    title: art.title,
    year: art.year,
    museum: art.museum,
    artistSnippet,
    paintingSnippet,
    tags,
  })

  await buildImage({ imgBuffer, outputPath: postPath })
  fs.writeFileSync(captionPath, caption.trim() + '\n', 'utf8')

  console.log(`\nInstagram kit → social/instagram/${date}/`)
  console.log(`  · post.jpg`)
  console.log(`  · caption.txt\n`)
  console.log(fs.readFileSync(captionPath, 'utf8'))
}

main().catch((e) => { console.error(e.message || e); process.exit(1) })
