const APP_BASE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://4rtw0rk.vercel.app').replace(/\/+$/, '')
const DEFAULT_TITLE = '4rtW0rk - One minute art puzzle'
const DEFAULT_DESCRIPTION =
  'Guess the painter in five attempts while the artwork gracefully zooms out. No ads, just culture.'
const DEFAULT_LOGO = `${APP_BASE_URL}/file.svg`

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

export default function Head({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const dateParam = normalizeDateParam(searchParams.date)
  const pageUrl = buildDateUrl(dateParam)
  const ogImage = buildOgImageUrl(dateParam)
  return (
    <>
      <title>{DEFAULT_TITLE}</title>
      <meta name="description" content={DEFAULT_DESCRIPTION} />
      <meta property="og:locale" content="en_US" />
      <meta property="og:type" content="website" />
      <meta property="og:url" content={pageUrl} />
      <meta property="og:title" content={DEFAULT_TITLE} />
      <meta property="og:description" content={DEFAULT_DESCRIPTION} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:site_name" content="4rtW0rk" />
      <meta property="og:logo" content={DEFAULT_LOGO} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta property="twitter:url" content={pageUrl} />
      <meta name="twitter:title" content={DEFAULT_TITLE} />
      <meta name="twitter:description" content={DEFAULT_DESCRIPTION} />
      <meta name="twitter:image" content={ogImage} />
    </>
  )
}
