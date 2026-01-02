import { supabase } from '@/lib/supabaseClient'
import ArchiveContent, { type ArchiveArtwork } from './ArchiveContent'

export const metadata = {
  title: 'Archive Explorations | 4rtW0rk',
  description:
    'Archive Explorations curates the 30 newest painter-guessing puzzles—dig into their clues, revisit famous canvases, and return to today’s challenge with a single tap.',
  keywords: ['art puzzles', 'daily art game', 'archive', '4rtW0rk', 'artist guessing'],
  openGraph: {
    title: 'Archive Explorations | 4rtW0rk',
    description:
      'Archive Explorations curates the 30 newest painter-guessing puzzles—dig into their clues, revisit famous canvases, and return to today’s challenge with a single tap.',
    url: 'https://4rtw0rk.vercel.app/archive',
    type: 'website',
    siteName: '4rtW0rk',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Archive Explorations | 4rtW0rk',
    description:
      'Archive Explorations curates the 30 newest painter-guessing puzzles—dig into their clues, revisit famous canvases, and return to today’s challenge with a single tap.',
  },
  metadataBase: new URL('https://4rtw0rk.vercel.app'),
  robots: {
    index: true,
    follow: true,
  },
}

const fetchRecentArt = async (): Promise<ArchiveArtwork[]> => {
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('daily_art')
    .select('id, date, title, artist, cached_image_url, image_url')
    .lte('date', today)
    .order('date', { ascending: false })
    .limit(30)

  if (error) {
    console.error('Unable to fetch archive', error)
    return []
  }
  return data || []
}

export default async function ArchivePage() {
  const artworks = await fetchRecentArt()
  return <ArchiveContent artworks={artworks} />
}
