import type { Metadata } from 'next'
import { supabase } from '@/lib/supabaseClient'
import { getTodayDateKey, normalizeDayKey, resolvePlayableDate } from '@/lib/dateUtils'

const APP_BASE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://whopaintedthis.vercel.app').replace(/\/+$/, '')
const HOME_TITLE = 'Who painted this?'
const HOME_DESCRIPTION = 'This artwork starts zoomed-in. You have 5 tries to guess the painter. Ready?'
const PUZZLE_DESCRIPTION =
  'Daily art puzzle: zoom out in 5 tries and guess the painter without spoilers.'
const DEFAULT_LOGO = `${APP_BASE_URL}/file.svg`

export const normalizeDateParam = (value?: string | string[]) =>
  Array.isArray(value) ? value[0].trim() : (value ?? '').trim()

const buildPuzzleUrl = (date?: string) =>
  date ? `${APP_BASE_URL}/puzzle/${encodeURIComponent(date)}` : `${APP_BASE_URL}/`
const buildSolutionUrl = (date: string) =>
  `${APP_BASE_URL}/puzzle/${encodeURIComponent(date)}/solution`
const buildOgImageUrl = (date?: string) =>
  `${APP_BASE_URL}/api/share/og-image${date ? `?date=${encodeURIComponent(date)}` : ''}`

const DEFAULT_OG_IMAGE = buildOgImageUrl()
const IMAGE_PLACEHOLDER = { url: DEFAULT_OG_IMAGE, width: 1200, height: 630 }

const resolveTargetDate = (value?: string): { targetDate: string; canonicalDate?: string } => {
  const today = getTodayDateKey()
  const normalized = normalizeDayKey(normalizeDateParam(value))
  if (!normalized) {
    return { targetDate: today }
  }
  const candidate = resolvePlayableDate(normalized)
  if (candidate) {
    return { targetDate: candidate, canonicalDate: candidate }
  }
  return { targetDate: today }
}

type ArtworkMetadata = {
  title: string
  artist: string
  year: string | null
}

const fetchArtworkMetadata = async (date: string | null): Promise<ArtworkMetadata | null> => {
  try {
    if (!date) {
      return null
    }
    const { data, error } = await supabase
      .from('daily_art')
      .select('title, artist, year')
      .eq('date', date)
      .maybeSingle()
    if (error || !data) return null
    if (typeof data.title !== 'string' || typeof data.artist !== 'string') return null
    return {
      title: data.title,
      artist: data.artist,
      year: typeof data.year === 'string' ? data.year : null,
    }
  } catch {
    return null
  }
}

const BASE_METADATA: Metadata = {
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  metadataBase: new URL(APP_BASE_URL),
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    url: APP_BASE_URL,
    siteName: 'Who painted this?',
    type: 'website',
    locale: 'en_US',
    images: [IMAGE_PLACEHOLDER],
  },
  twitter: {
    card: 'summary_large_image',
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    images: DEFAULT_OG_IMAGE,
  },
  other: { 'og:logo': DEFAULT_LOGO },
}

export function buildPuzzleMetadataForDate(date?: string): Metadata {
  const { targetDate, canonicalDate } = resolveTargetDate(date)
  const isDailyPuzzlePage = Boolean(canonicalDate)
  const metadataTitle = isDailyPuzzlePage
    ? `Daily art puzzle (${canonicalDate}) | Who painted this?`
    : HOME_TITLE
  const metadataDescription = isDailyPuzzlePage
    ? PUZZLE_DESCRIPTION
    : HOME_DESCRIPTION
  const url = buildPuzzleUrl(canonicalDate)
  const image = buildOgImageUrl(targetDate)

  return {
    ...BASE_METADATA,
    title: metadataTitle,
    description: metadataDescription,
    robots: {
      index: isDailyPuzzlePage ? false : true,
      follow: true,
    },
    alternates: {
      canonical: url,
    },
    openGraph: {
      ...BASE_METADATA.openGraph,
      title: metadataTitle,
      description: metadataDescription,
      url,
      images: [{ url: image, width: 1200, height: 630 }],
    },
    twitter: {
      ...BASE_METADATA.twitter,
      title: metadataTitle,
      description: metadataDescription,
      images: image,
    },
  }
}

export async function buildSolutionMetadataForDate(date?: string): Promise<Metadata> {
  const playableDate = resolvePlayableDate(date)
  if (!playableDate) {
    return {
      ...buildPuzzleMetadataForDate(),
      robots: {
        index: false,
        follow: true,
      },
    }
  }

  const artMetadata = await fetchArtworkMetadata(playableDate)
  const url = buildSolutionUrl(playableDate)
  const image = buildOgImageUrl(playableDate)
  const shareTitle = artMetadata
    ? `Artwork details · ${artMetadata.title} — ${artMetadata.artist}`
    : `Artwork details (${playableDate}) | Who painted this?`
  const metadataTitle = artMetadata
    ? `${artMetadata.title}${
        artMetadata.year ? ` (${artMetadata.year})` : ''
      } by ${artMetadata.artist} | Who painted this?`
    : `Artwork details (${playableDate}) | Who painted this?`
  const metadataDescription = artMetadata
    ? `Artwork details for ${playableDate}: ${artMetadata.title} by ${artMetadata.artist}${
        artMetadata.year ? ` (${artMetadata.year})` : ''
      }.`
    : `Official artwork details page for the ${playableDate} puzzle.`

  return {
    ...BASE_METADATA,
    title: metadataTitle,
    description: metadataDescription,
    robots: {
      index: true,
      follow: true,
    },
    alternates: {
      canonical: url,
    },
    openGraph: {
      ...BASE_METADATA.openGraph,
      title: shareTitle,
      description: metadataDescription,
      url,
      images: [{ url: image, width: 1200, height: 630 }],
    },
    twitter: {
      ...BASE_METADATA.twitter,
      title: shareTitle,
      description: metadataDescription,
      images: image,
    },
  }
}
