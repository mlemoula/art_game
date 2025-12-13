import type { Metadata } from 'next'

const DEFAULT_META_DESCRIPTION =
  'Guess the painter in five attempts while the artwork gracefully zooms out. No ads, just culture.'

export const metadata: Metadata = {
  title: '4rtW0rk — daily art puzzle',
  description: DEFAULT_META_DESCRIPTION,
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://4rtw0rk.com'),
  openGraph: {
    title: '4rtW0rk — daily art puzzle',
    description: DEFAULT_META_DESCRIPTION,
    url: process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/`
      : 'https://4rtw0rk.com/',
    siteName: '4rtW0rk',
    type: 'website',
    images: [
      {
        url: '/meta/og-default.png',
        width: 1200,
        height: 630,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '4rtW0rk — daily art puzzle',
    description: DEFAULT_META_DESCRIPTION,
  },
}
