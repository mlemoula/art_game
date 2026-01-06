import type { Metadata } from 'next'

const DEFAULT_META_DESCRIPTION =
  'Guess the painter in five attempts while the artwork gracefully zooms out. No ads, just culture.'
const APP_BASE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://4rtw0rk.com').replace(/\/+$/, '')
const DEFAULT_LOGO = `${APP_BASE_URL}/file.svg`

const DEFAULT_METADATA: Metadata = {
  title: '4rtW0rk - One minute art puzzle',
  description: DEFAULT_META_DESCRIPTION,
  metadataBase: new URL(APP_BASE_URL),
  openGraph: {
    title: '4rtW0rk - One minute art puzzle',
    description: DEFAULT_META_DESCRIPTION,
    url: `${APP_BASE_URL}/`,
    siteName: '4rtW0rk',
    type: 'website',
    locale: 'en_US',
    images: [
      {
        url: DEFAULT_LOGO,
        width: 1200,
        height: 630,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '4rtW0rk - One minute art puzzle',
    description: DEFAULT_META_DESCRIPTION,
    images: DEFAULT_LOGO,
  },
  other: {
    'og:logo': DEFAULT_LOGO,
  },
}

const buildOgImageUrl = (date?: string) => {
  const cleanDate = date?.trim()
  const query = cleanDate ? `?date=${encodeURIComponent(cleanDate)}` : ''
  return `${APP_BASE_URL}/api/share/og-image${query}`
}

export const metadata: Metadata = DEFAULT_METADATA

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}): Promise<Metadata> {
  const dateParam = Array.isArray(searchParams.date)
    ? searchParams.date[0]
    : searchParams.date
  const ogImageUrl = buildOgImageUrl(dateParam)
  return {
    ...DEFAULT_METADATA,
    openGraph: {
      ...DEFAULT_METADATA.openGraph,
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
        },
      ],
    },
    twitter: {
      ...DEFAULT_METADATA.twitter,
      images: ogImageUrl,
    },
    other: DEFAULT_METADATA.other,
  }
}
