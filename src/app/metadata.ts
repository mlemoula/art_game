import type { Metadata } from 'next'
import { supabase } from '@/lib/supabaseClient'

const APP_BASE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://whopaintedthis.vercel.app').replace(/\/+$/, '')
const DEFAULT_TITLE = 'Who painted this?'
const DEFAULT_DESCRIPTION = 'This artwork starts zoomed-in. You have 5 tries to guess the painter. Ready?'
const DEFAULT_LOGO = `${APP_BASE_URL}/file.svg`

export const normalizeDateParam = (value?: string | string[]) =>
  Array.isArray(value) ? value[0].trim() : (value ?? '').trim()

const buildDateUrl = (date?: string) =>
  date ? `${APP_BASE_URL}/?date=${encodeURIComponent(date)}` : `${APP_BASE_URL}/`
const buildOgImageUrl = (date?: string) =>
  `${APP_BASE_URL}/api/share/og-image${date ? `?date=${encodeURIComponent(date)}` : ''}`

const DEFAULT_OG_IMAGE = buildOgImageUrl()
const IMAGE_PLACEHOLDER = { url: DEFAULT_OG_IMAGE, width: 1200, height: 630 }

const getTodayKey = () => new Date().toISOString().split('T')[0]

const parseIsoDateParam = (value?: string) => {
  const normalized = normalizeDateParam(value)
  if (!normalized) return null
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().split('T')[0]
}

const resolveTargetDate = (value?: string): { targetDate: string; canonicalDate?: string } => {
  const today = getTodayKey()
  const candidate = parseIsoDateParam(value)
  if (candidate && candidate <= today) {
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
  title: DEFAULT_TITLE,
  description: DEFAULT_DESCRIPTION,
  metadataBase: new URL(APP_BASE_URL),
  openGraph: {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    url: APP_BASE_URL,
    siteName: 'Who painted this?',
    type: 'website',
    locale: 'en_US',
    images: [IMAGE_PLACEHOLDER],
  },
  twitter: {
    card: 'summary_large_image',
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: DEFAULT_OG_IMAGE,
  },
  other: { 'og:logo': DEFAULT_LOGO },
}

export async function buildMetadataForDate(date?: string): Promise<Metadata> {
  const { targetDate, canonicalDate } = resolveTargetDate(date)
  const artMetadata = await fetchArtworkMetadata(targetDate)
  const shareTitle = artMetadata
    ? `Who painted this? · ${artMetadata.title}`
    : DEFAULT_TITLE
  const metadataTitle = artMetadata
    ? `${artMetadata.title} by ${artMetadata.artist}${
        artMetadata.year ? ` (${artMetadata.year})` : ''
      } · Who painted this?`
    : DEFAULT_TITLE
  const metadataDescription = artMetadata
    ? `${artMetadata.title} by ${artMetadata.artist}${
        artMetadata.year ? ` (${artMetadata.year})` : ''
      }. ${DEFAULT_DESCRIPTION}`
    : DEFAULT_DESCRIPTION
  const url = buildDateUrl(canonicalDate)
  const image = buildOgImageUrl(targetDate)

  return {
    ...BASE_METADATA,
    title: metadataTitle,
    description: metadataDescription,
    openGraph: {
      ...BASE_METADATA.openGraph,
      title: shareTitle,
      description: DEFAULT_DESCRIPTION,
      url,
      images: [{ url: image, width: 1200, height: 630 }],
    },
    twitter: {
      ...BASE_METADATA.twitter,
      title: shareTitle,
      description: DEFAULT_DESCRIPTION,
      images: image,
    },
  }
}
