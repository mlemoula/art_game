import type { Metadata } from 'next'
import Link from 'next/link'

// The apex domain redirects to www, so the canonical must be the www URL (NEXT_PUBLIC_APP_URL is the apex)
const BASE_URL = 'https://www.signalbeat.studio'
const PAGE_URL = `${BASE_URL}/wayne-thiebaud`
const AMAZON_TAG = 'waynethieba06-20'

const TITLE = 'Wayne Thiebaud: the best books and where to see his paintings'
const DESCRIPTION =
  'An unofficial guide to Wayne Thiebaud (1920–2021): three books worth owning, and the museums that hold his paintings.'

export const metadata: Metadata = {
  title: `${TITLE} | Who painted this?`,
  description: DESCRIPTION,
  metadataBase: new URL(BASE_URL),
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: PAGE_URL,
    type: 'article',
    siteName: 'Who painted this?',
  },
  twitter: { card: 'summary', title: TITLE, description: DESCRIPTION },
}

const amazonUrl = (asin: string) => `https://www.amazon.com/dp/${asin}?tag=${AMAZON_TAG}`

// Descriptions only restate what the listings say (title, authors); no claims beyond that.
const BOOKS = [
  {
    asin: '1087501172',
    title: 'Wayne Thiebaud 100: Paintings, Prints, and Drawings',
    byline: 'Text by Scott Shields',
    text: 'The widest overview of the three: a survey of his paintings, prints and drawings. Start here if you want the whole career in one volume.',
  },
  {
    asin: '1452169934',
    title: 'Delicious Metropolis: The Desserts and Urban Scenes of Wayne Thiebaud',
    byline: 'Desserts and cityscapes',
    text: 'Focuses on the two subjects most people picture first: the cakes and pies, and the steep streets and city views.',
  },
  {
    asin: '0847871622',
    title: 'Wayne Thiebaud (Updated Edition)',
    byline: 'Essays by Kenneth Baker, Nicholas Fox Weber, Karen Wilkin and John Yau',
    text: 'A monograph for readers who want the critical writing as well as the pictures.',
  },
]

const MUSEUMS = [
  { name: 'Crocker Art Museum', place: 'Sacramento, California', url: 'https://www.crockerart.org/' },
  { name: 'San Francisco Museum of Modern Art (SFMOMA)', place: 'San Francisco, California', url: 'https://www.sfmoma.org/' },
  { name: 'Whitney Museum of American Art', place: 'New York', url: 'https://whitney.org/' },
]

export default function WayneThiebaudGuide() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: TITLE,
    description: DESCRIPTION,
    mainEntityOfPage: PAGE_URL,
    inLanguage: 'en',
  }

  return (
    <main className="min-h-screen bg-[#FFF6E8] text-[#2B2118]">
      <div aria-hidden className="flex h-2">
        <div className="flex-1 bg-[#E9A3B5]" />
        <div className="flex-1 bg-[#F4D774]" />
        <div className="flex-1 bg-[#9FD3DE]" />
      </div>

      <article className="mx-auto max-w-2xl px-5 py-10 sm:py-14">
        <p className="mb-4 inline-block rounded-full border border-[#2B2118]/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
          Unofficial fan guide
        </p>
        <h1 className="font-serif text-3xl font-bold leading-tight sm:text-4xl">{TITLE}</h1>
        <p className="mt-5 text-lg leading-relaxed">
          Wayne Thiebaud (1920–2021) was an American painter best known for his cakes, pies and shop-window displays,
          painted in thick, buttery strokes, and for the steep streets of San Francisco. Seeing the paintings in person
          is the best way to understand them; these books are the next best thing.
        </p>

        <p className="mt-5 rounded-xl bg-white/70 p-4 text-sm leading-relaxed">
          <strong>Affiliate disclosure:</strong> some links on this page are affiliate links. As an Amazon Associate I earn
          from qualifying purchases, at no extra cost to you. This is an independent guide, not affiliated with Wayne
          Thiebaud&apos;s estate or with any museum.
        </p>

        <h2 className="mt-12 font-serif text-2xl font-bold">Three books worth owning</h2>
        <ul className="mt-5 space-y-5">
          {BOOKS.map((book) => (
            <li key={book.asin} className="rounded-2xl border border-[#2B2118]/10 bg-white p-5">
              <h3 className="font-serif text-xl font-bold leading-snug">{book.title}</h3>
              <p className="mt-1 text-sm text-[#2B2118]/70">{book.byline}</p>
              <p className="mt-3 leading-relaxed">{book.text}</p>
              <a
                href={amazonUrl(book.asin)}
                target="_blank"
                rel="sponsored nofollow noopener noreferrer"
                className="mt-4 inline-block rounded-full bg-[#2B2118] px-5 py-2.5 text-sm font-semibold text-[#FFF6E8] transition hover:bg-[#4a3a2c]"
              >
                View on Amazon
              </a>
            </li>
          ))}
        </ul>

        <h2 className="mt-12 font-serif text-2xl font-bold">Where to see his paintings</h2>
        <p className="mt-4 leading-relaxed">
          Several major museums hold his work. What is on view changes, so search for &ldquo;Thiebaud&rdquo; in each
          museum&apos;s online collection before you go.
        </p>
        <ul className="mt-4 space-y-3">
          {MUSEUMS.map((museum) => (
            <li key={museum.url}>
              <a
                href={museum.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline decoration-[#E9A3B5] decoration-2 underline-offset-4"
              >
                {museum.name}
              </a>
              <span className="text-[#2B2118]/70"> — {museum.place}</span>
            </li>
          ))}
        </ul>

        <h2 className="mt-12 font-serif text-2xl font-bold">About this guide</h2>
        <p className="mt-4 leading-relaxed">
          His paintings are not reproduced here: they remain under copyright and are best seen at the museums above or in
          the books. If you notice a mistake, or a book or museum worth adding, tell me and I will fix it.
        </p>

        <p className="mt-12 border-t border-[#2B2118]/10 pt-6 text-sm">
          Like looking at paintings?{' '}
          <Link href="/" className="font-semibold underline underline-offset-4">
            Play &ldquo;Who painted this?&rdquo;
          </Link>
          , a daily art quiz: one painting, five tries.
        </p>
      </article>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </main>
  )
}
