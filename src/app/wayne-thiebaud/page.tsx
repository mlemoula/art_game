import type { Metadata } from 'next'
import Link from 'next/link'
import { Libre_Franklin } from 'next/font/google'
import BookCover from './BookCover'

// The apex domain redirects to www, so the canonical must be the www URL (NEXT_PUBLIC_APP_URL is the apex)
const BASE_URL = 'https://www.signalbeat.studio'
const PAGE_URL = `${BASE_URL}/wayne-thiebaud`
const AMAZON_TAG = 'waynethieba06-20'

const TITLE = 'Wayne Thiebaud: the best books and where to see his paintings'
const DESCRIPTION =
  'An unofficial guide to Wayne Thiebaud (1920–2021): the books worth owning, with covers, and the museums that hold his paintings.'

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

// Cover services: Open Library (free covers API) and Penguin Random House (distributes Rizzoli).
const openLibraryCover = (isbn: string) => `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`
const prhCover = (isbn: string) => `https://images.penguinrandomhouse.com/cover/${isbn}`

// Direct product link when the listing was seen on amazon.com; otherwise an ISBN search, which cannot lead to a dead page.
const productLink = (asin: string) => `https://www.amazon.com/dp/${asin}?tag=${AMAZON_TAG}`
const isbnSearchLink = (isbn: string) => `https://www.amazon.com/s?k=${isbn}&tag=${AMAZON_TAG}`

type Book = {
  isbn: string
  cover?: string
  width: number
  height: number
  title: string
  subtitle?: string
  byline: string
  publisher: string
  year?: string
  text: string
  href: string
}

// Titles, authors, publishers and years come from the publishers' and library catalogues; descriptions stay factual.
const BOOKS: Book[] = [
  {
    isbn: '9781087501178',
    cover: openLibraryCover('9781087501178'),
    width: 432,
    height: 500,
    title: 'Wayne Thiebaud 100',
    subtitle: 'Paintings, Prints, and Drawings',
    byline: 'Scott Shields',
    publisher: 'Pomegranate',
    year: '2020',
    text: 'The widest overview of the list: a survey of his paintings, prints and drawings. Start here if you want the whole career in one volume.',
    href: productLink('1087501172'),
  },
  {
    isbn: '9781452169934',
    cover: openLibraryCover('9781452169934'),
    width: 463,
    height: 500,
    title: 'Delicious Metropolis',
    subtitle: 'The Desserts and Urban Scenes of Wayne Thiebaud',
    byline: 'Wayne Thiebaud',
    publisher: 'Chronicle Books',
    year: '2019',
    text: 'The two subjects most people picture first: the cakes and pies, and the steep streets and city views.',
    href: productLink('1452169934'),
  },
  {
    isbn: '9780847871629',
    cover: prhCover('9780847871629'),
    width: 372,
    height: 450,
    title: 'Wayne Thiebaud',
    subtitle: 'Updated Edition',
    byline: 'Kenneth Baker, Nicholas Fox Weber, Karen Wilkin, John Yau',
    publisher: 'Rizzoli Electa',
    year: '2022',
    text: 'A monograph for readers who want the critical writing as well as the pictures.',
    href: isbnSearchLink('9780847871629'),
  },
  {
    isbn: '9780847847792',
    cover: prhCover('9780847847792'),
    width: 333,
    height: 450,
    title: 'Wayne Thiebaud: Summer Days',
    byline: 'Steven A. Nash and Mary Okin, with Acquavella Galleries',
    publisher: 'Rizzoli',
    text: 'An exhibition catalogue on the American summer (beach scenes, ice creams, hot dogs), organized with the Wayne Thiebaud Foundation.',
    href: isbnSearchLink('9780847847792'),
  },
  {
    isbn: '9780847839254',
    cover: openLibraryCover('9780847839254'),
    width: 393,
    height: 500,
    title: 'Wayne Thiebaud',
    subtitle: 'A Retrospective',
    byline: 'John Wilmerding',
    publisher: 'Rizzoli',
    year: '2012',
    text: 'A compact survey of his career, from the early still lifes to the later landscapes.',
    href: productLink('0847839257'),
  },
  {
    isbn: '9780500092927',
    cover: openLibraryCover('9780500092927'),
    width: 367,
    height: 475,
    title: 'Wayne Thiebaud',
    subtitle: 'A Paintings Retrospective',
    byline: 'Steven A. Nash, with Adam Gopnik',
    publisher: 'Thames & Hudson',
    year: '2000',
    text: 'The catalogue of a major touring retrospective, with an essay by Adam Gopnik.',
    href: productLink('0500092923'),
  },
  {
    isbn: '9780520418325',
    width: 300,
    height: 450,
    title: 'Art Comes from Art',
    byline: 'Timothy Anglin Burgard and contributors',
    publisher: 'University of California Press',
    year: '2025',
    text: 'Looks at how his work draws on earlier painting. A good pick if you like spotting influences.',
    href: productLink('0520418328'),
  },
]

const [FEATURED, ...MORE_BOOKS] = BOOKS

const MUSEUMS = [
  { name: 'Crocker Art Museum', place: 'Sacramento, California', url: 'https://www.crockerart.org/' },
  { name: 'SFMOMA', place: 'San Francisco, California', url: 'https://www.sfmoma.org/' },
  { name: 'Whitney Museum of American Art', place: 'New York', url: 'https://whitney.org/' },
]

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#222]'
const coverShadow = 'shadow-[0_22px_32px_-14px_rgba(0,0,0,0.45)]'

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

      <section className="mx-auto max-w-3xl px-5 pb-2 pt-12 text-center sm:pt-16">
        <p className="mb-4 text-xs font-bold uppercase tracking-[0.25em] text-[#222]/55">Unofficial fan guide</p>
        <h1 className="text-3xl font-light leading-tight tracking-tight sm:text-5xl">{TITLE}</h1>
        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-[#222]/75 sm:text-lg">
          Wayne Thiebaud (1920–2021) was an American painter best known for his cakes, pies and shop-window displays,
          painted in thick, buttery strokes, and for the steep streets of San Francisco. These are the books to own.
        </p>
      </section>

      <section aria-labelledby="featured" className="mx-auto grid max-w-5xl items-center gap-10 px-5 py-14 md:grid-cols-[minmax(0,340px)_1fr] md:gap-16">
        <div className="flex justify-center">
          <BookCover
            src={FEATURED.cover}
            width={FEATURED.width}
            height={FEATURED.height}
            title={FEATURED.title}
            eager
            className={`h-auto w-full max-w-[300px] ${coverShadow}`}
          />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#222]/55">Start here</p>
          <h2 id="featured" className="mt-3 text-3xl font-light leading-tight sm:text-4xl">
            {FEATURED.title}
          </h2>
          {FEATURED.subtitle ? <p className="mt-1 text-lg font-light text-[#222]/70">{FEATURED.subtitle}</p> : null}
          <p className="mt-4 text-sm font-bold">{FEATURED.byline}</p>
          <p className="text-sm text-[#222]/60">
            {FEATURED.publisher}
            {FEATURED.year ? `, ${FEATURED.year}` : ''}
          </p>
          <p className="mt-5 leading-relaxed text-[#222]/80">{FEATURED.text}</p>
          <a
            href={FEATURED.href}
            target="_blank"
            rel="sponsored nofollow noopener noreferrer"
            aria-label={`View ${FEATURED.title} on Amazon (affiliate link)`}
            className={`mt-8 block bg-[#2a2a2a] px-12 py-4 text-center text-sm font-bold text-white transition hover:bg-black md:inline-block ${focusRing}`}
          >
            View on Amazon
          </a>
          <p className="mt-3 text-xs text-[#222]/50">Affiliate link</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16">
        <h2 className="text-center text-2xl font-light tracking-tight sm:text-3xl">More Thiebaud books</h2>
        <ul className="mt-10 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
          {MORE_BOOKS.map((book) => (
            <li key={book.isbn} className="flex flex-col bg-white px-4 pb-6 pt-8 shadow-[0_10px_30px_rgba(0,0,0,0.05)] sm:px-6">
              <div className="flex h-56 items-end justify-center">
                <BookCover
                  src={book.cover}
                  width={book.width}
                  height={book.height}
                  title={book.title}
                  className={`h-full w-auto max-w-full ${coverShadow}`}
                />
              </div>
              <h3 className="mt-8 text-center text-[15px] font-bold leading-snug">
                {book.title}
                {book.subtitle ? <span className="block font-light text-[#222]/70">{book.subtitle}</span> : null}
              </h3>
              <p className="mt-2 text-center text-xs text-[#222]/65">{book.byline}</p>
              <p className="text-center text-xs text-[#222]/50">
                {book.publisher}
                {book.year ? `, ${book.year}` : ''}
              </p>
              <p className="mb-5 mt-4 hidden text-sm leading-relaxed text-[#222]/80 sm:block">{book.text}</p>
              <div className="mt-auto pt-4 text-center">
                <a
                  href={book.href}
                  target="_blank"
                  rel="sponsored nofollow noopener noreferrer"
                  aria-label={`View ${book.title}${book.subtitle ? `, ${book.subtitle}` : ''} on Amazon (affiliate link)`}
                  className={`inline-block bg-[#2a2a2a] px-6 py-2.5 text-sm font-bold text-white transition hover:bg-black ${focusRing}`}
                >
                  View on Amazon
                </a>
              </div>
            </li>
          ))}
        </ul>
        <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-relaxed text-[#222]/60">
          <strong className="font-bold text-[#222]">Affiliate disclosure:</strong> these are affiliate links. As an Amazon
          Associate I earn from qualifying purchases, at no extra cost to you. Book covers belong to their publishers and
          are shown only to help you find the books.
        </p>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-16">
        <h2 className="text-center text-2xl font-light tracking-tight sm:text-3xl">Where to see his paintings</h2>
        <p className="mx-auto mt-4 max-w-xl text-center leading-relaxed text-[#222]/75">
          Several major museums hold his work. What is on view changes, so search for &ldquo;Thiebaud&rdquo; in each
          museum&apos;s online collection before you go.
        </p>
        <ul className="mt-10 grid sm:grid-cols-3">
          {MUSEUMS.map((museum) => (
            <li key={museum.url} className="border-t border-[#222]/15 sm:pr-8">
              <a
                href={museum.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`group block py-6 ${focusRing}`}
              >
                <span className="block text-2xl font-light leading-tight">{museum.name}</span>
                <span className="mt-2 block text-xs font-bold uppercase tracking-[0.2em] text-[#222]/55">
                  {museum.place}
                </span>
                <span className="mt-4 inline-block text-sm font-bold underline underline-offset-4 group-hover:no-underline">
                  Visit the museum <span aria-hidden>↗</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <footer className="border-t border-[#222]/10 px-5 py-10 text-center text-sm leading-relaxed text-[#222]/75">
        <p className="mx-auto max-w-xl">
          An independent fan guide, not affiliated with Wayne Thiebaud&apos;s estate or with any museum or publisher. If you
          notice a mistake, or a book worth adding, tell me and I will fix it.
        </p>
        <p className="mt-4">
          Like looking at paintings?{' '}
          <Link href="/" className={`font-bold underline underline-offset-4 ${focusRing}`}>
            Play &ldquo;Who painted this?&rdquo;
          </Link>
          , a daily art quiz: one painting, five tries.
        </p>
      </footer>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </main>
  )
}
