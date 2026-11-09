import type { Metadata } from 'next'
import Link from 'next/link'
import { Libre_Franklin } from 'next/font/google'

// The apex domain redirects to www, so the canonical must be the www URL (NEXT_PUBLIC_APP_URL is the apex)
const BASE_URL = 'https://www.signalbeat.studio'
const PAGE_URL = `${BASE_URL}/wayne-thiebaud`
const AMAZON_TAG = 'waynethieba06-20'

const TITLE = 'Wayne Thiebaud: the best books and where to see his paintings'
const DESCRIPTION =
  'An unofficial guide to Wayne Thiebaud (1920–2021): three books worth owning, and the museums that hold his paintings.'

const franklin = Libre_Franklin({ subsets: ['latin'], weight: ['300', '400', '700'] })

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

// Flat pastels only: the paintings themselves are not reproduced anywhere on this page.
const PINK = '#E9A3B5'
const YELLOW = '#F4D774'
const BLUE = '#9FD3DE'

// Descriptions only restate what the listings say (title, authors); no claims beyond that.
const BOOKS = [
  {
    asin: '1087501172',
    cover: PINK,
    kicker: 'Survey',
    title: 'Wayne Thiebaud 100: Paintings, Prints, and Drawings',
    short: 'Wayne Thiebaud 100',
    byline: 'Text by Scott Shields',
    text: 'The widest overview of the three: a survey of his paintings, prints and drawings. Start here if you want the whole career in one volume.',
  },
  {
    asin: '1452169934',
    cover: YELLOW,
    kicker: 'Desserts & cities',
    title: 'Delicious Metropolis: The Desserts and Urban Scenes of Wayne Thiebaud',
    short: 'Delicious Metropolis',
    byline: 'Chronicle Books',
    text: 'Focuses on the two subjects most people picture first: the cakes and pies, and the steep streets and city views.',
  },
  {
    asin: '0520418328',
    cover: BLUE,
    kicker: 'Influences',
    title: 'Wayne Thiebaud: Art Comes from Art',
    short: 'Art Comes from Art',
    byline: 'Timothy Anglin Burgard and contributors, University of California Press',
    text: 'Looks at how his work draws on earlier painting. A good pick if you like spotting influences, as in the daily art quiz.',
  },
]

const MUSEUMS = [
  { name: 'Crocker Art Museum', place: 'Sacramento, California', url: 'https://www.crockerart.org/', color: PINK },
  { name: 'SFMOMA', place: 'San Francisco, California', url: 'https://www.sfmoma.org/', color: YELLOW },
  { name: 'Whitney Museum of American Art', place: 'New York', url: 'https://whitney.org/', color: BLUE },
]

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#222]'

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
    <main className={`${franklin.className} min-h-screen bg-[#F3EFE6] text-[#222]`}>
      <header className="border-b border-[#222]/10">
        <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center px-5 py-4">
          <Link
            href="/"
            aria-label="Back to Who painted this?"
            className={`text-xs font-bold uppercase tracking-widest ${focusRing}`}
          >
            <span aria-hidden>←</span>
            <span className="ml-2 hidden sm:inline">Who painted this?</span>
          </Link>
          <span className="text-base font-light uppercase tracking-[0.3em] sm:text-lg">Thiebaud Notes</span>
          <span aria-hidden />
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-5 pb-6 pt-12 text-center sm:pt-16">
        <p className="mb-5 text-xs font-bold uppercase tracking-[0.25em] text-[#222]/60">Unofficial fan guide</p>
        <h1 className="text-3xl font-light leading-tight tracking-tight sm:text-5xl">{TITLE}</h1>
        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-[#222]/80 sm:text-lg">
          Wayne Thiebaud (1920–2021) was an American painter best known for his cakes, pies and shop-window displays,
          painted in thick, buttery strokes, and for the steep streets of San Francisco. Seeing the paintings in person
          is the best way to understand them; these books are the next best thing.
        </p>
        <div aria-hidden className="mx-auto mt-10 flex h-20 max-w-2xl overflow-hidden rounded-sm sm:h-28">
          <div className="flex-1" style={{ background: PINK }} />
          <div className="flex-1" style={{ background: YELLOW }} />
          <div className="flex-1" style={{ background: BLUE }} />
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 pb-4">
        <p className="rounded-sm border border-[#222]/15 px-4 py-3 text-center text-xs leading-relaxed text-[#222]/75">
          <strong className="font-bold text-[#222]">Affiliate disclosure:</strong> some links on this page are affiliate
          links. As an Amazon Associate I earn from qualifying purchases, at no extra cost to you. This is an independent
          guide, not affiliated with Wayne Thiebaud&apos;s estate or with any museum.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
        <h2 className="text-center text-2xl font-light tracking-tight sm:text-3xl">Three books worth owning</h2>
        <ul className="mt-10 grid gap-5 sm:grid-cols-3">
          {BOOKS.map((book) => (
            <li key={book.asin} className="flex flex-col bg-white p-6 shadow-[0_10px_30px_rgba(0,0,0,0.06)]">
              <div
                aria-hidden
                className="mx-auto flex aspect-[3/4] w-36 flex-col justify-between p-4 shadow-[0_12px_24px_rgba(0,0,0,0.18)]"
                style={{ background: book.cover }}
              >
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#222]/70">{book.kicker}</span>
                <span className="font-serif text-lg font-bold leading-tight">{book.short}</span>
              </div>
              <h3 className="mt-6 text-center text-base font-bold leading-snug">{book.title}</h3>
              <p className="mt-1 text-center text-xs text-[#222]/60">{book.byline}</p>
              <p className="mt-4 text-sm leading-relaxed text-[#222]/80">{book.text}</p>
              <a
                href={amazonUrl(book.asin)}
                target="_blank"
                rel="sponsored nofollow noopener noreferrer"
                aria-label={`View ${book.short} on Amazon (affiliate link)`}
                className={`mt-6 block bg-[#2a2a2a] px-4 py-3 text-center text-sm font-bold text-white transition hover:bg-black ${focusRing}`}
              >
                View on Amazon
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-12 sm:pb-16">
        <h2 className="text-center text-2xl font-light tracking-tight sm:text-3xl">Where to see his paintings</h2>
        <p className="mx-auto mt-4 max-w-xl text-center leading-relaxed text-[#222]/80">
          Several major museums hold his work. What is on view changes, so search for &ldquo;Thiebaud&rdquo; in each
          museum&apos;s online collection before you go.
        </p>
        <ul className="mt-10 grid gap-4 sm:grid-cols-3">
          {MUSEUMS.map((museum) => (
            <li key={museum.url}>
              <a
                href={museum.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex aspect-[4/3] flex-col items-center justify-center px-4 text-center transition hover:opacity-90 ${focusRing}`}
                style={{ background: museum.color }}
              >
                <span className="font-serif text-2xl font-bold italic leading-tight">{museum.name}</span>
                <span className="mt-2 text-xs font-bold uppercase tracking-[0.2em] text-[#222]/70">
                  {museum.place} <span aria-hidden>↗</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-2xl px-5 pb-12 text-center">
        <h2 className="text-2xl font-light tracking-tight">About this guide</h2>
        <p className="mt-4 leading-relaxed text-[#222]/80">
          His paintings are not reproduced here: they remain under copyright and are best seen at the museums above or in
          the books. If you notice a mistake, or a book or museum worth adding, tell me and I will fix it.
        </p>
      </section>

      <footer className="border-t border-[#222]/10 px-5 py-8 text-center text-sm">
        Like looking at paintings?{' '}
        <Link href="/" className={`font-bold underline underline-offset-4 ${focusRing}`}>
          Play &ldquo;Who painted this?&rdquo;
        </Link>
        , a daily art quiz: one painting, five tries.
      </footer>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </main>
  )
}
