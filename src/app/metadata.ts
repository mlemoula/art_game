import type { Metadata } from 'next'

const APP_BASE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://4rtw0rk.vercel.app').replace(/\/+$/, '')
const DEFAULT_TITLE = '4rtW0rk - One minute art puzzle'
const DEFAULT_DESCRIPTION =
  'Guess the painter in five attempts while the artwork gracefully zooms out. No ads, just culture.'
const DEFAULT_LOGO = `${APP_BASE_URL}/file.svg`

const IMAGE_PLACEHOLDER = {
  url: `${APP_BASE_URL}/meta/og-default.png`,
  width: 1200,
  height: 630,
}

export const metadata: Metadata = {
  title: DEFAULT_TITLE,
  description: DEFAULT_DESCRIPTION,
  metadataBase: new URL(APP_BASE_URL),
  openGraph: {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    url: `${APP_BASE_URL}/`,
    type: 'website',
    siteName: '4rtW0rk',
    locale: 'en_US',
    images: [IMAGE_PLACEHOLDER],
  },
  twitter: {
    card: 'summary_large_image',
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: IMAGE_PLACEHOLDER.url,
  },
  other: {
    'og:logo': DEFAULT_LOGO,
  },
}

const buildDateUrl = (date?: string) => {
  if (!date) return `${APP_BASE_URL}/`
  const clean = date.trim()
  if (!clean) return `${APP_BASE_URL}/`
  return `${APP_BASE_URL}/?date=${encodeURIComponent(clean)}`
}

const buildOgImageUrl = (date?: string) => {
  const clean = date?.trim()
  return `${APP_BASE_URL}/api/share/og-image${clean ? `?date=${encodeURIComponent(clean)}` : ''}`
}

const normalizeDateParam = (value?: string | string[]) => {
  if (!value) return ''
  return Array.isArray(value) ? value[0] : value
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}): Promise<Metadata> {
  const dateParam = normalizeDateParam(searchParams.date)
  const shareUrl = buildDateUrl(dateParam)
  const imageUrl = buildOgImageUrl(dateParam)

  return {
    ...metadata,
    openGraph: {
      ...metadata.openGraph,
      url: shareUrl,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
        },
      ],
    },
    twitter: {
      ...metadata.twitter,
      images: imageUrl,
    },
  }
}
