import { supabase } from '@/lib/supabaseClient'
import ArchiveContent, { type ArchiveArtwork } from './ArchiveContent'

const ARCHIVE_DESCRIPTION =
  'Replay up to 30 recent artworks and open detailed artist and painting information after you complete each challenge.'
const BASE_URL = 'https://whopaintedthis.vercel.app'

export const metadata = {
  title: 'Artwork Archive | Who painted this?',
  description: ARCHIVE_DESCRIPTION,
  keywords: ['artworks', 'daily art game', 'archive', 'who painted this', 'painting details'],
  openGraph: {
    title: 'Artwork Archive | Who painted this?',
    description: ARCHIVE_DESCRIPTION,
    url: `${BASE_URL}/archive`,
    type: 'website',
    siteName: 'Who painted this?',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Artwork Archive | Who painted this?',
    description: ARCHIVE_DESCRIPTION,
  },
  metadataBase: new URL(BASE_URL),
  alternates: {
    canonical: `${BASE_URL}/archive`,
  },
  robots: {
    index: true,
    follow: true,
  },
}

const fetchRecentArt = async (): Promise<ArchiveArtwork[]> => {
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('daily_art')
    .select('id, date, title, cached_image_url, image_url')
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
  const today = new Date().toISOString().split('T')[0]
  const structuredData = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Artwork Archive',
    description: ARCHIVE_DESCRIPTION,
    url: `${BASE_URL}/archive`,
    hasPart: artworks
      .map((art, index) => {
        if (!art.date || art.date >= today) return null
        return {
          '@type': 'ListItem',
          position: index + 1,
          url: `${BASE_URL}/puzzle/${encodeURIComponent(art.date)}/solution`,
        }
      })
      .filter(Boolean),
  })
  return <ArchiveContent artworks={artworks} structuredData={structuredData} />
}
