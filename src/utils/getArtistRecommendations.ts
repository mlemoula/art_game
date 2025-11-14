import { supabase } from '@/lib/supabaseClient'

export interface ArtistRecommendation {
  name: string
  movement?: string | null
  country?: string | null
  birth_year?: number | null
  death_year?: number | null
}

const ARTIST_COLUMNS = 'name,movement,country,birth_year,death_year'

const ARTIST_API_ENABLED =
  typeof process !== 'undefined' &&
  process.env.NEXT_PUBLIC_ENABLE_SUPABASE_ARTISTS === 'true'

export async function getArtistRecommendations(
  correctArtistName: string,
  limit = 5
): Promise<ArtistRecommendation[]> {
  if (!correctArtistName || !ARTIST_API_ENABLED) return []

  try {
    const { data: correctRows } = await supabase
      .from('artists')
      .select(ARTIST_COLUMNS)
      .ilike('name', correctArtistName)
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
  try {
    const { data } = await supabase
      .from('artists')
      .select(ARTIST_COLUMNS)
      .ilike('name', name)
      .limit(1)
    return data?.[0] ?? null
  } catch {
    return null
  }
}
