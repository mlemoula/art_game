/**
 * Shared cached Supabase helpers — use these instead of raw supabase calls
 * in route handlers so identical queries are served from Next.js Data Cache.
 *
 * Cache keys automatically include function arguments, so e.g.
 *   getCachedDailyArtwork('2026-05-24')  →  key: ['daily-artwork', '2026-05-24']
 *   getCachedArtistProfile('Claude Monet') →  key: ['artist-profile', 'Claude Monet']
 */
import { unstable_cache } from 'next/cache'
import { supabase } from './supabaseClient'

export type ArtistProfile = {
  movement: string | null
  country: string | null
  birth_year: number | null
  death_year: number | null
  popularity_score: number | null
}

export type DailyArtwork = {
  id: number
  date: string
  title: string | null
  artist: string
  year: string | null
  museum: string | null
  image_url: string
  cached_image_url: string | null
  wiki_summary_url: string | null
  wiki_artist_summary_url: string | null
}

// ─── Daily artwork ────────────────────────────────────────────────────────────
// Same row all day → cache for 24 h
export const getCachedDailyArtwork = unstable_cache(
  async (date: string): Promise<DailyArtwork | null> => {
    const { data, error } = await supabase
      .from('daily_art')
      .select(
        'id, date, title, artist, year, museum, image_url, cached_image_url, wiki_summary_url, wiki_artist_summary_url'
      )
      .eq('date', date)
      .maybeSingle()

    if (error || !data) return null

    return {
      id: data.id as number,
      date: data.date as string,
      title: typeof data.title === 'string' ? data.title : null,
      artist: typeof data.artist === 'string' ? data.artist.trim() : '',
      year: typeof data.year === 'string' ? data.year : null,
      museum: typeof data.museum === 'string' ? data.museum : null,
      image_url: data.image_url as string,
      cached_image_url: typeof data.cached_image_url === 'string' ? data.cached_image_url : null,
      wiki_summary_url: typeof data.wiki_summary_url === 'string' ? data.wiki_summary_url : null,
      wiki_artist_summary_url:
        typeof data.wiki_artist_summary_url === 'string' ? data.wiki_artist_summary_url : null,
    }
  },
  ['daily-artwork'],
  { revalidate: 86400 }
)

// ─── Artist profile ───────────────────────────────────────────────────────────
// Static biographical data → cache for 7 days
export const getCachedArtistProfile = unstable_cache(
  async (name: string): Promise<ArtistProfile | null> => {
    if (!name) return null

    const { data: exact } = await supabase
      .from('artists')
      .select('movement, country, birth_year, death_year, popularity_score')
      .ilike('name', name)
      .maybeSingle()

    if (exact) {
      return {
        movement: typeof exact.movement === 'string' ? exact.movement : null,
        country: typeof exact.country === 'string' ? exact.country : null,
        birth_year: typeof exact.birth_year === 'number' ? exact.birth_year : null,
        death_year: typeof exact.death_year === 'number' ? exact.death_year : null,
        popularity_score:
          typeof exact.popularity_score === 'number' ? exact.popularity_score : null,
      }
    }

    // Fallback: fuzzy match
    const { data: fuzzyRows } = await supabase
      .from('artists')
      .select('movement, country, birth_year, death_year, popularity_score')
      .ilike('name', `%${name}%`)
      .order('popularity_score', { ascending: false })
      .limit(1)

    const fuzzy = fuzzyRows?.[0]
    if (!fuzzy) return null

    return {
      movement: typeof fuzzy.movement === 'string' ? fuzzy.movement : null,
      country: typeof fuzzy.country === 'string' ? fuzzy.country : null,
      birth_year: typeof fuzzy.birth_year === 'number' ? fuzzy.birth_year : null,
      death_year: typeof fuzzy.death_year === 'number' ? fuzzy.death_year : null,
      popularity_score:
        typeof fuzzy.popularity_score === 'number' ? fuzzy.popularity_score : null,
    }
  },
  ['artist-profile'],
  { revalidate: 604800 }
)

// ─── Canonical artist name ────────────────────────────────────────────────────
// Many users guess the same names → cache for 24 h
const normalizeString = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()

export const getCachedCanonicalArtistName = unstable_cache(
  async (name: string): Promise<string | null> => {
    if (!name) return null

    const { data: exactRows, error: exactError } = await supabase
      .from('artists')
      .select('name')
      .ilike('name', name)
      .limit(10)

    if (exactError) return null

    const normalizedName = normalizeString(name)
    const exactMatch = (exactRows ?? []).find(
      (row) => typeof row.name === 'string' && normalizeString(row.name) === normalizedName
    )
    if (exactMatch?.name) return exactMatch.name as string

    const { data: candidateRows, error: candidateError } = await supabase
      .from('artists')
      .select('name')
      .ilike('name', `%${name}%`)
      .limit(25)

    if (candidateError) return null

    const candidateMatch = (candidateRows ?? []).find(
      (row) => typeof row.name === 'string' && normalizeString(row.name) === normalizedName
    )
    return (candidateMatch?.name as string) ?? null
  },
  ['canonical-artist'],
  { revalidate: 86400 }
)

// ─── Puzzle number ────────────────────────────────────────────────────────────
// Count of artworks with date <= given date = sequential puzzle number.
// Stable for past dates → cache for 7 days.
export const getCachedPuzzleNumber = unstable_cache(
  async (date: string): Promise<number | null> => {
    const { count, error } = await supabase
      .from('daily_art')
      .select('*', { count: 'exact', head: true })
      .lte('date', date)
    if (error || count === null) return null
    return count
  },
  ['puzzle-number'],
  { revalidate: 604800 }
)

// ─── Movement peers ───────────────────────────────────────────────────────────
// Static → cache for 7 days
export const getCachedMovementPeers = unstable_cache(
  async (movement: string, excludeName: string): Promise<string[]> => {
    const { data: peerRows } = await supabase
      .from('artists')
      .select('name')
      .ilike('movement', movement)
      .neq('name', excludeName)
      .order('popularity_score', { ascending: false })
      .limit(3)

    if (!peerRows) return []
    return peerRows
      .map((r) => (typeof r.name === 'string' ? r.name : ''))
      .filter(Boolean)
  },
  ['movement-peers'],
  { revalidate: 604800 }
)
