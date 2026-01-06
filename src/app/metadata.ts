import type { Metadata } from 'next'

const APP_BASE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://4rtw0rk.vercel.app').replace(/\/+$/, '')
const DEFAULT_TITLE = 'Can you guess today’s painter?'
const DEFAULT_DESCRIPTION = 'This artwork starts zoomed-in. You have 5 tries to guess the painter. Ready?'
const DEFAULT_LOGO = `${APP_BASE_URL}/file.svg`

export const normalizeDateParam = (value?: string | string[]) =>
  Array.isArray(value) ? value[0].trim() : (value ?? '').trim()

const buildDateUrl = (date?: string) => date ? `${APP_BASE_URL}/?date=${encodeURIComponent(date)}` : `${APP_BASE_URL}/`
const buildOgImageUrl = (date?: string) => `${APP_BASE_URL}/api/share/og-image${date ? `?date=${encodeURIComponent(date)}` : ''}`

const DEFAULT_OG_IMAGE = buildOgImageUrl()
const IMAGE_PLACEHOLDER = { url: DEFAULT_OG_IMAGE, width: 1200, height: 630 }

const BASE_METADATA: Metadata = {
  title: DEFAULT_TITLE,
  description: DEFAULT_DESCRIPTION,
  metadataBase: new URL(APP_BASE_URL),
  openGraph: {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    url: APP_BASE_URL,
    siteName: '4rtW0rk',
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

export function buildMetadataForDate(date?: string): Metadata {
  const url = buildDateUrl(date)
  const image = buildOgImageUrl(date)

  return {
    ...BASE_METADATA,
    openGraph: {
      ...BASE_METADATA.openGraph,
      url,
      images: [{ url: image, width: 1200, height: 630 }],
    },
    twitter: {
      ...BASE_METADATA.twitter,
      images: image,
    },
  }
}
