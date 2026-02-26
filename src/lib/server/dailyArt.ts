import { resolvePlayableDate } from '@/lib/dateUtils'
import { supabase } from '@/lib/supabaseClient'

export type DailyArtDetails = {
  id: number
  date: string
  title: string
  artist: string
  year: string | null
  museum: string | null
  image_url: string
  cached_image_url: string | null
  wiki_summary_url: string | null
}

export const fetchDailyArtDetailsByDate = async (
  date?: string | null
): Promise<DailyArtDetails | null> => {
  const playableDate = resolvePlayableDate(date)
  if (!playableDate) return null

  const { data, error } = await supabase
    .from('daily_art')
    .select(
      'id, date, title, artist, year, museum, image_url, cached_image_url, wiki_summary_url'
    )
    .eq('date', playableDate)
    .maybeSingle()

  if (error || !data) return null
  if (typeof data.id !== 'number') return null
  if (typeof data.date !== 'string') return null
  if (typeof data.title !== 'string') return null
  if (typeof data.artist !== 'string') return null
  if (typeof data.image_url !== 'string') return null

  return {
    id: data.id,
    date: data.date,
    title: data.title,
    artist: data.artist,
    year: typeof data.year === 'string' ? data.year : null,
    museum: typeof data.museum === 'string' ? data.museum : null,
    image_url: data.image_url,
    cached_image_url:
      typeof data.cached_image_url === 'string' ? data.cached_image_url : null,
    wiki_summary_url:
      typeof data.wiki_summary_url === 'string' ? data.wiki_summary_url : null,
  }
}
