const APP_BASE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://4rtw0rk.vercel.app').replace(/\/+$/, '')
const DEFAULT_META_TITLE = '4rtW0rk - One minute art puzzle'
const DEFAULT_META_DESCRIPTION =
  'Guess the painter in five attempts while the artwork gracefully zooms out. No ads, just culture.'
const DEFAULT_LOGO = `${APP_BASE_URL}/file.svg`

const normalizeDateParam = (value?: string | string[]) => {
  if (!value) return ''
  const raw = Array.isArray(value) ? value[0] : value
  return raw.trim()
}

export default function Head({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const dateParam = normalizeDateParam(searchParams.date)
  const basePath = dateParam ? `/?date=${encodeURIComponent(dateParam)}` : '/'
  const pageUrl = `${APP_BASE_URL}${basePath}`
  const ogImageUrl = `${APP_BASE_URL}/api/share/og-image${dateParam ? `?date=${encodeURIComponent(dateParam)}` : ''}`

  return (
    <>
      <title>{DEFAULT_META_TITLE}</title>
      <meta name="description" content={DEFAULT_META_DESCRIPTION} />
      <meta property="og:locale" content="en_US" />
      <meta property="og:type" content="website" />
      <meta property="og:url" content={pageUrl} />
      <meta property="og:title" content={DEFAULT_META_TITLE} />
      <meta property="og:description" content={DEFAULT_META_DESCRIPTION} />
      <meta property="og:image" content={ogImageUrl} />
      <meta property="og:image:alt" content="A cropped detail from today’s art puzzle" />
      <meta property="og:logo" content={DEFAULT_LOGO} />
      <meta property="og:site_name" content="4rtW0rk" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta property="twitter:domain" content={new URL(APP_BASE_URL).host} />
      <meta property="twitter:url" content={pageUrl} />
      <meta name="twitter:title" content={DEFAULT_META_TITLE} />
      <meta name="twitter:description" content={DEFAULT_META_DESCRIPTION} />
      <meta name="twitter:image" content={ogImageUrl} />
    </>
  )
}
