'use client'

import Image from 'next/image'
import Link from 'next/link'

export type ArchiveArtwork = {
  id: number
  date?: string | null
  title: string
  artist: string
  cached_image_url?: string | null
  image_url: string
}

const formatDate = (value?: string | null) => {
  if (!value) return 'unknown date'
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(value))
  } catch {
    return 'unknown date'
  }
}

type ArchiveContentProps = {
  artworks: ArchiveArtwork[]
}

export default function ArchiveContent({ artworks }: ArchiveContentProps) {
  return (
    <div className="min-h-screen bg-white px-4 py-12 text-slate-900 dark:bg-slate-950 dark:text-white">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/"
              className="text-[10px] uppercase tracking-[0.4em] text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
            >
              Back to today’s puzzle
            </Link>
          </div>
          <h1 className="text-base font-semibold tracking-[0.35em] uppercase text-slate-400 dark:text-slate-300">
            Archive: The 30 most recent artworks.
          </h1>
        </header>
        <div className="grid gap-4 md:grid-cols-2">
          {artworks.map((art) => (
            <article
              key={art.id}
              className="flex h-full flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="text-[11px] uppercase tracking-[0.35em] text-slate-500 dark:text-slate-400">
                {formatDate(art.date)}
              </div>
              <p className="text-base font-semibold tracking-tight">{art.title}</p>
              <p className="text-sm text-slate-600 dark:text-slate-300">{art.artist}</p>
              <div className="relative h-44 overflow-hidden rounded-xl bg-slate-200 dark:bg-slate-800">
                <Image
                  src={art.cached_image_url || art.image_url}
                  alt={`${art.title} — ${art.artist}`}
                  className="h-full w-full object-cover"
                  width={400}
                  height={267}
                  priority={false}
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
              </div>
              <Link
                href={`/?date=${art.date ?? ''}`}
                className="mt-auto inline-flex items-center justify-center rounded-full border border-dashed border-slate-400 px-3 py-1 text-[10px] uppercase tracking-[0.35em] text-slate-700 dark:border-slate-600 dark:text-slate-200"
              >
                Replay this puzzle
              </Link>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
