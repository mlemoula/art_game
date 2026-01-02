import { supabase } from '@/lib/supabaseClient'
import ArchiveContent, { type ArchiveArtwork } from './ArchiveContent'

const ARCHIVE_DESCRIPTION =
  'Archive Explorations curates the 30 newest painter-guessing puzzles—dig into their clues, revisit famous canvases, and return to today’s challenge with a single tap.'
const BASE_URL = 'https://4rtw0rk.vercel.app'

export const metadata = {
  title: 'Archive Explorations | 4rtW0rk',
  description: ARCHIVE_DESCRIPTION,
  keywords: ['art puzzles', 'daily art game', 'archive', '4rtW0rk', 'artist guessing'],
  openGraph: {
    title: 'Archive Explorations | 4rtW0rk',
    description: ARCHIVE_DESCRIPTION,
    url: `${BASE_URL}/archive`,
    type: 'website',
    siteName: '4rtW0rk',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Archive Explorations | 4rtW0rk',
    description: ARCHIVE_DESCRIPTION,
  },
  metadataBase: new URL(BASE_URL),
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
  const structuredData = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Archive Explorations',
    description: ARCHIVE_DESCRIPTION,
    url: `${BASE_URL}/archive`,
    hasPart: artworks
      .map((art, index) => {
        if (!art.date) return null
        return {
          '@type': 'ListItem',
          position: index + 1,
          url: `${BASE_URL}/?date=${art.date}`,
          item: {
            '@type': 'CreativeWork',
            name: art.title,
            creator: {
              '@type': 'Person',
              name: art.artist,
            },
            image: art.cached_image_url || art.image_url,
          },
        }
      })
      .filter(Boolean),
  })
  return <ArchiveContent artworks={artworks} structuredData={structuredData} />
}
