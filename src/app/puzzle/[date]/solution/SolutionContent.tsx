'use client'

import Image from 'next/image'
import Link from 'next/link'

import ThemeToggleButton from '@/components/ThemeToggleButton'
import { useTheme } from '@/context/theme'

type SolutionContentProps = {
  date: string
  title: string
  artist: string
  year: string | null
  museum: string | null
  imageUrl: string
  puzzleUrl: string
  artistWikiUrl: string | null
  artworkWikiUrl: string | null
  artworkParagraphs: string[]
  artistParagraphs: string[]
  movement: string | null
  country: string | null
}

export default function SolutionContent({
  date,
  title,
  artist,
  year,
  museum,
  imageUrl,
  puzzleUrl,
  artistWikiUrl,
  artworkWikiUrl,
  artworkParagraphs,
  artistParagraphs,
  movement,
  country,
}: SolutionContentProps) {
  const { theme, toggleTheme, hydrated } = useTheme()

  return (
    <main
      suppressHydrationWarning
      data-theme={hydrated ? theme : 'light'}
      className="min-h-screen px-4 py-10"
      style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }}
    >
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs uppercase tracking-[0.25em] card-meta">Artwork details · {date}</p>
            {hydrated ? (
              <ThemeToggleButton theme={theme} toggleTheme={toggleTheme} />
            ) : (
              <span className="inline-flex h-6 w-12 rounded-full border border-transparent" aria-hidden="true" />
            )}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight card-foreground">{title}</h1>
          <p className="text-lg card-meta">
            by <strong className="card-foreground">{artist}</strong>
            {year ? ` · ${year}` : ''}
          </p>
          <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.2em]">
            <Link
              href={puzzleUrl}
              className="rounded-full border px-3 py-1 card-meta"
              style={{ borderColor: 'var(--card-border)' }}
            >
              Play this artwork
            </Link>
            <Link
              href="/archive"
              className="rounded-full border px-3 py-1 card-meta"
              style={{ borderColor: 'var(--card-border)' }}
            >
              Archive
            </Link>
          </div>
        </header>

        <div className="overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--card-border)' }}>
          <Image
            src={imageUrl}
            alt={`${title} by ${artist}`}
            width={1200}
            height={900}
            className="h-auto w-full object-cover"
            priority
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div
            className="rounded-2xl border p-4 text-sm leading-relaxed"
            style={{
              borderColor: 'var(--card-border)',
              backgroundColor: 'var(--card-background)',
            }}
          >
            <p className="text-[11px] uppercase tracking-[0.2em] card-meta">Artist</p>
            <div className="mt-2 space-y-2">
              {artistParagraphs.map((paragraph, index) => (
                <p key={`artist-paragraph-${index}`} className="card-foreground">
                  {paragraph}
                </p>
              ))}
            </div>
            {artistWikiUrl ? (
              <a
                href={artistWikiUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-xs underline decoration-dotted card-meta"
              >
                Learn more about {artist}
              </a>
            ) : null}
          </div>
          <div
            className="rounded-2xl border p-4 text-sm leading-relaxed"
            style={{
              borderColor: 'var(--card-border)',
              backgroundColor: 'var(--card-background)',
            }}
          >
            <p className="text-[11px] uppercase tracking-[0.2em] card-meta">Artwork</p>
            <div className="mt-2 space-y-2">
              {artworkParagraphs.map((paragraph, index) => (
                <p key={`artwork-paragraph-${index}`} className="card-foreground">
                  {paragraph}
                </p>
              ))}
            </div>
            {artworkWikiUrl ? (
              <a
                href={artworkWikiUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-xs underline decoration-dotted card-meta"
              >
                Learn more about this painting
              </a>
            ) : null}
          </div>
        </div>

        <section
          className="rounded-2xl border p-4 text-sm"
          style={{
            borderColor: 'var(--card-border)',
            backgroundColor: 'var(--card-background)',
          }}
        >
          <p className="text-[11px] uppercase tracking-[0.2em] card-meta">Quick facts</p>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="card-meta">Artist</dt>
              <dd className="card-foreground">{artist}</dd>
            </div>
            <div>
              <dt className="card-meta">Year</dt>
              <dd className="card-foreground">{year || 'Unknown'}</dd>
            </div>
            <div>
              <dt className="card-meta">Movement</dt>
              <dd className="card-foreground">{movement || 'Not documented'}</dd>
            </div>
            <div>
              <dt className="card-meta">Country</dt>
              <dd className="card-foreground">{country || 'Not documented'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="card-meta">Location</dt>
              <dd className="card-foreground">{museum || 'Unknown'}</dd>
            </div>
          </dl>
        </section>
      </div>
    </main>
  )
}
