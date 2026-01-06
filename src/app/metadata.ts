import type { Metadata } from 'next'

const APP_BASE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://4rtw0rk.vercel.app').replace(/\/+$/, '')
const DEFAULT_META_DESCRIPTION =
  'Guess the painter in five attempts while the artwork gracefully zooms out. No ads, just culture.'
const DEFAULT_TITLE = '4rtW0rk - One minute art puzzle'
const DEFAULT_LOGO = `${APP_BASE_URL}/file.svg`

const baseOpenGraph = {
  title: DEFAULT_TITLE,
  description: DEFAULT_META_DESCRIPTION,
  siteName: '4rtW0rk',
  type: 'website',
  locale: 'en_US',
  url: `${APP_BASE_URL}/`,
  images: [
    {
      url: DEFAULT_LOGO,
      width: 1200,
      height: 630,
    },
  ],
}

const baseTwitter = {
  card: 'summary_large_image',
  title: DEFAULT_TITLE,
  description: DEFAULT_META_DESCRIPTION,
  creator: '@4rtw0rk',
  images: DEFAULT_LOGO,
}

export const metadata: Metadata = {
  title: DEFAULT_TITLE,
  description: DEFAULT_META_DESCRIPTION,
  metadataBase: new URL(APP_BASE_URL),
  openGraph: baseOpenGraph,
  twitter: baseTwitter,
  other: {
    'og:logo': DEFAULT_LOGO,
  },
}

const buildShareUrl = (date?: string) => {
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
  const shareUrl = buildShareUrl(dateParam)
  const imageUrl = buildOgImageUrl(dateParam)

  return {
    ...metadata,
    openGraph: {
      ...baseOpenGraph,
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
      ...baseTwitter,
      images: imageUrl,
    },
  }
}
