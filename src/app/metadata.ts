import type { Metadata } from 'next'

const APP_BASE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://4rtw0rk.vercel.app').replace(/\/+$/, '')
const DEFAULT_TITLE = '4rtW0rk - One minute art puzzle'
const DEFAULT_DESCRIPTION = 'Guess the painter in five attempts while the artwork gracefully zooms out. No ads, just culture.'
const DEFAULT_LOGO = `${APP_BASE_URL}/file.svg`

const IMAGE_PLACEHOLDER = { url: DEFAULT_LOGO, width: 1200, height: 630 }

const normalizeDate = (value?: string | string[]) => Array.isArray(value) ? value[0].trim() : (value ?? '').trim()

const buildDateUrl = (date?: string) => date ? `${APP_BASE_URL}/?date=${encodeURIComponent(date)}` : `${APP_BASE_URL}/`
const buildOgImageUrl = (date?: string) => `${APP_BASE_URL}/api/share/og-image${date ? `?date=${encodeURIComponent(date)}` : ''}`

export const metadata: Metadata = {
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
    images: IMAGE_PLACEHOLDER.url,
  },
  other: { 'og:logo': DEFAULT_LOGO },
}

export async function generateMetadata({
  searchParams,
}: { searchParams: Record<string, string | string[] | undefined> }): Promise<Metadata> {
  const date = normalizeDate(searchParams.date)
  const url = buildDateUrl(date)
  const image = buildOgImageUrl(date)

  return {
    ...metadata,
    openGraph: {
      ...metadata.openGraph,
      url,
      images: [{ url: image, width: 1200, height: 630 }],
    },
    twitter: {
      ...metadata.twitter,
      images: image,
    },
  }
}
