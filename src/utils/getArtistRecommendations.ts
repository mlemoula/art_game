import { supabase } from '@/lib/supabaseClient'

export interface ArtistRecommendation {
  name: string
  movement?: string | null
  country?: string | null
  birth_year?: number | null
  death_year?: number | null
  popularity_score?: number | null
}

const ARTIST_COLUMNS =
  'name,movement,country,birth_year,death_year,popularity_score'

const ARTIST_API_ENABLED =
  typeof process !== 'undefined' &&
  process.env.NEXT_PUBLIC_ENABLE_SUPABASE_ARTISTS === 'true'

const cleanValue = (value: string) => value.trim()
const makePattern = (value: string) => `%${cleanValue(value)}%`
const MIN_PROFILE_QUERY_LENGTH = 3

export async function getArtistRecommendations(
  correctArtistName: string,
  limit = 5
): Promise<ArtistRecommendation[]> {
  if (!correctArtistName || !ARTIST_API_ENABLED) return []

  try {
    const { data: correctRows } = await supabase
      .from('artists')
      .select(ARTIST_COLUMNS)
      .ilike('name', makePattern(correctArtistName))
      .limit(1)

    const { data: others } = await supabase
      .from('artists')
      .select(ARTIST_COLUMNS)
      .neq('name', correctArtistName)
      .order('name', { ascending: true })
      .limit(limit * 3)

    const map = new Map<string, ArtistRecommendation>()

    const addEntry = (entry?: ArtistRecommendation | null) => {
      if (!entry?.name) return
      map.set(entry.name, entry)
    }

    addEntry(correctRows?.[0])

    if (others?.length) {
      others
        .sort(() => Math.random() - 0.5)
        .slice(0, limit * 2)
        .forEach(addEntry)
    }

    return Array.from(map.values()).slice(0, limit + 1)
  } catch {
    return [{ name: correctArtistName }]
  }
}

export async function getArtistProfile(
  name: string
): Promise<ArtistRecommendation | null> {
  if (!name || !ARTIST_API_ENABLED) return null
  const normalized = cleanValue(name)
  if (normalized.length < MIN_PROFILE_QUERY_LENGTH) return null

  try {
    const { data: exactMatch, error: exactError } = await supabase
      .from('artists')
      .select(ARTIST_COLUMNS)
      .ilike('name', normalized)
      .maybeSingle()

    if (exactMatch) return exactMatch
    if (exactError && exactError.code !== 'PGRST116') {
      throw exactError
    }

    const { data: fuzzyRows } = await supabase
      .from('artists')
      .select(ARTIST_COLUMNS)
      .ilike('name', makePattern(normalized))
      .order('popularity_score', { ascending: false })
      .limit(1)

    return fuzzyRows?.[0] ?? null
  } catch {
    return null
  }
}
