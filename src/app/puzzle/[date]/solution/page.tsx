import { notFound } from 'next/navigation'

import { buildSolutionMetadataForDate } from '@/app/metadata'
import { getTodayDateKey, resolvePlayableDate } from '@/lib/dateUtils'
import { fetchDailyArtDetailsByDate } from '@/lib/server/dailyArt'
import { getArtistProfile } from '@/utils/getArtistRecommendations'
import {
  buildWikiApiUrl,
  extractParagraphs,
  extractTextFromWikiJson,
} from '@/utils/wikiSummary'

import SolutionContent from './SolutionContent'

type PuzzleSolutionPageProps = {
  params: Promise<{ date: string }>
}

const BASE_URL = 'https://whopaintedthis.vercel.app'

export async function generateMetadata({ params }: PuzzleSolutionPageProps) {
  const { date } = await params
  const playableDate = resolvePlayableDate(date)
  if (!playableDate || playableDate >= getTodayDateKey()) {
    return {
      title: 'Artwork details | Who painted this?',
      description: 'Artwork details are available after the daily puzzle window closes.',
      robots: { index: false, follow: true },
    }
  }
  return buildSolutionMetadataForDate(date)
}

export const dynamic = 'force-dynamic'

const fetchWikiParagraphs = async (sourceUrl?: string | null, limit = 2) => {
  if (!sourceUrl) return []
  try {
    const summaryUrl = buildWikiApiUrl(sourceUrl)
    const response = await fetch(summaryUrl, {
      headers: { accept: 'application/json' },
      next: { revalidate: 3600 },
    })
    if (!response.ok) return []
    const payload = await response.json()
    const text = extractTextFromWikiJson(payload)
    if (!text) return []
    return extractParagraphs(text).slice(0, limit)
  } catch {
    return []
  }
}

export default async function PuzzleSolutionPage({
  params,
}: PuzzleSolutionPageProps) {
  const { date } = await params
  const playableDate = resolvePlayableDate(date)
  if (!playableDate || playableDate >= getTodayDateKey()) {
    notFound()
  }
  const artwork = await fetchDailyArtDetailsByDate(date)
  if (!artwork) {
    notFound()
  }

  const artistProfile = await getArtistProfile(artwork.artist)
  const artworkParagraphsFromWiki = await fetchWikiParagraphs(artwork.wiki_summary_url, 3)
  const artistWikiUrl = artwork.artist
    ? `https://en.wikipedia.org/wiki/${encodeURIComponent(
        artwork.artist.replace(/\s+/g, '_')
      )}`
    : null
  const artistParagraphsFromWiki = await fetchWikiParagraphs(artistWikiUrl, 3)
  const fallbackArtworkParagraph = `${artwork.title} by ${artwork.artist}${
    artwork.year ? ` (${artwork.year})` : ''
  }${artwork.museum ? ` is currently displayed at ${artwork.museum}.` : '.'}`
  const fallbackArtistParagraph = `${artwork.artist}${
    artistProfile?.country ? ` was a ${artistProfile.country} painter` : ' was a painter'
  }${artistProfile?.movement ? ` associated with the ${artistProfile.movement} movement.` : '.'}`
  const artworkParagraphs = artworkParagraphsFromWiki.length
    ? artworkParagraphsFromWiki
    : [fallbackArtworkParagraph]
  const artistParagraphs = artistParagraphsFromWiki.length
    ? artistParagraphsFromWiki
    : [fallbackArtistParagraph]
  const solutionUrl = `${BASE_URL}/puzzle/${encodeURIComponent(artwork.date)}/solution`
  const puzzleUrl = `/puzzle/${encodeURIComponent(artwork.date)}`
  const structuredData = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'VisualArtwork',
    name: artwork.title,
    creator: {
      '@type': 'Person',
      name: artwork.artist,
    },
    description: artworkParagraphs.join(' '),
    image: artwork.cached_image_url || artwork.image_url,
    url: solutionUrl,
    isPartOf: {
      '@type': 'WebSite',
      name: 'Who painted this?',
      url: BASE_URL,
    },
  })

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: structuredData }}
      />
      <SolutionContent
        date={artwork.date}
        title={artwork.title}
        artist={artwork.artist}
        year={artwork.year}
        museum={artwork.museum}
        imageUrl={artwork.cached_image_url || artwork.image_url}
        puzzleUrl={puzzleUrl}
        artistWikiUrl={artistWikiUrl}
        artworkWikiUrl={artwork.wiki_summary_url}
        artworkParagraphs={artworkParagraphs}
        artistParagraphs={artistParagraphs}
        movement={artistProfile?.movement ?? null}
        country={artistProfile?.country ?? null}
      />
    </>
  )
}
