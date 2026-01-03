'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import ThemeToggleButton from '@/components/ThemeToggleButton'
import { useTheme } from '@/context/theme'

export type ArchiveArtwork = {
  id: number
  date?: string | null
  title: string
  artist: string
  cached_image_url?: string | null
  image_url: string
  wiki_summary_url?: string | null
  description?: string | null
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
  structuredData?: string
}

type AttemptSummary = {
  correct: boolean
}

type UserPlaySummary = {
  success: boolean
  attempts: number | null
  history?: AttemptSummary[]
}

type UserScoreMap = Record<number, UserPlaySummary>

const PROGRESS_KEY_PREFIX = 'art-progress-'
const MAX_ARCHIVE_ATTEMPTS = 5

const normalizeSuccessFlag = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized === 'true' || normalized === 't' || normalized === '1'
  }
  return false
}

const normalizeAttemptsHistory = (value: unknown): AttemptSummary[] => {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const correct = (entry as { correct?: unknown }).correct
      if (typeof correct !== 'boolean') return null
      return { correct }
    })
    .filter((entry): entry is AttemptSummary => Boolean(entry))
}

const pickPreferredSummary = (
  remote?: UserPlaySummary,
  local?: UserPlaySummary
): UserPlaySummary | undefined => {
  if (!remote) return local
  if (!local) return remote
  if (remote.success !== local.success) {
    return remote.success ? remote : local
  }
  const remoteAttempts =
    remote.attempts ?? remote.history?.length ?? Number.POSITIVE_INFINITY
  const localAttempts =
    local.attempts ?? local.history?.length ?? Number.POSITIVE_INFINITY
  if (remoteAttempts <= localAttempts) return remote
  return local
}

const buildScoreGlyphs = (history?: AttemptSummary[]) => {
  const tokens = Array.from({ length: MAX_ARCHIVE_ATTEMPTS }, (_, index) => {
    const attempt = history?.[index]
    if (!attempt) return '.'
    return attempt.correct ? '✅' : '×'
  })
  return tokens.join(' ')
}

export default function ArchiveContent({ artworks, structuredData }: ArchiveContentProps) {
  const { theme, toggleTheme, hydrated } = useTheme()
  const [userScores, setUserScores] = useState<UserScoreMap>({})
  const [localScores, setLocalScores] = useState<UserScoreMap>({})

  useEffect(() => {
    if (typeof window === 'undefined') return
    const schedule = window.setTimeout(() => {
      if (!artworks.length) {
        setLocalScores({})
        return
      }
      const nextScores: UserScoreMap = {}
      artworks.forEach((art) => {
        if (typeof art.id !== 'number') return
        const key = `${PROGRESS_KEY_PREFIX}${art.id}`
        const stored = window.localStorage.getItem(key)
        if (!stored) return
        try {
          const parsed = JSON.parse(stored)
          const attemptsHistory = Array.isArray(parsed.attemptsHistory)
            ? parsed.attemptsHistory
            : []
          const success = normalizeSuccessFlag(parsed.success)
          const history = attemptsHistory
            .map((attempt: unknown) => {
              if (!attempt || typeof attempt !== 'object') return null
              const correct = (attempt as { correct?: unknown }).correct
              if (typeof correct !== 'boolean') return null
              return { correct }
            })
            .filter((entry: AttemptSummary | null): entry is AttemptSummary => Boolean(entry))
          const attempts =
            attemptsHistory.length > 0 ? attemptsHistory.length : null
          nextScores[art.id] = { success, attempts, history }
        } catch {
          // ignore invalid local entry
        }
      })
      setLocalScores(nextScores)
    }, 0)
    return () => {
      window.clearTimeout(schedule)
    }
  }, [artworks])

  useEffect(() => {
    if (!artworks.length) return
    const token =
      typeof window !== 'undefined'
        ? window.localStorage.getItem('art_game_user_token')
        : null
    if (!token) return
    const dailyIds = Array.from(
      new Set(
        artworks
          .map((art) => art.id)
          .filter((id): id is number => typeof id === 'number')
      )
    )
    if (!dailyIds.length) return

    let cancelled = false

    const fetchUserScores = async () => {
      try {
        const { data } = await supabase
          .from('plays')
          .select('daily_id, success, attempts, attempts_data')
          .eq('user_token', token)
          .in('daily_id', dailyIds)
        if (cancelled || !data) return
        const summary: UserScoreMap = {}
        for (const row of data) {
          const dailyId = Number(row.daily_id)
          if (!Number.isFinite(dailyId)) continue
          const success = normalizeSuccessFlag(row.success)
          const history = normalizeAttemptsHistory(row.attempts_data)
          const attempts =
            typeof row.attempts === 'number'
              ? row.attempts
              : history.length > 0
              ? history.length
              : null
          const existing = summary[dailyId]
          if (!existing) {
            summary[dailyId] = { success, attempts, history }
            continue
          }
          const candidate: UserPlaySummary = { success, attempts, history }
          summary[dailyId] =
            pickPreferredSummary(candidate, existing) ?? candidate
        }
        if (!cancelled) {
          setUserScores(summary)
        }
      } catch (error) {
        console.error('Unable to fetch user archive scores', error)
      }
    }

    fetchUserScores()

    return () => {
      cancelled = true
    }
  }, [artworks])

  return (
    <div
      suppressHydrationWarning
      data-theme={hydrated ? theme : 'light'}
      className="min-h-screen px-4 py-12"
      style={{
        backgroundColor: 'var(--background)',
        color: 'var(--foreground)',
      }}
    >
      {structuredData ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: structuredData }}
        />
      ) : null}
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/"
              className="text-[10px] uppercase tracking-[0.4em] transition-colors card-link hover:opacity-80"
            >
              Back to today’s puzzle
            </Link>
            {hydrated ? (
              <ThemeToggleButton theme={theme} toggleTheme={toggleTheme} />
            ) : (
              <span className="inline-flex h-6 w-12 rounded-full border border-transparent" aria-hidden="true" />
            )}
          </div>
          <h1 className="text-base font-semibold tracking-[0.35em] uppercase text-slate-400 dark:text-slate-300">
            Archive: The 30 most recent artworks.
          </h1>
        </header>
        <div className="grid gap-4 md:grid-cols-2">
          {artworks.map((art) => {
            const userSummary = userScores[art.id]
            const localSummary = localScores[art.id]
            const effectiveSummary = pickPreferredSummary(userSummary, localSummary)
            const hasSolved = Boolean(effectiveSummary?.success)
            const hasAttempts = Boolean(effectiveSummary)
            const glyphRow = buildScoreGlyphs(effectiveSummary?.history)
            const titleText = hasAttempts ? art.title : ''
            const artistText = hasAttempts ? art.artist : ''
            const imageAlt = hasSolved
              ? `${art.title} — ${art.artist}`
              : 'Œuvre masquée jusqu’à ce que tu réussisses le puzzle.'

            return (
              <article
                key={art.id}
                itemScope
                itemType="https://schema.org/CreativeWork"
                className="flex h-full flex-col gap-3 rounded-2xl border p-3 shadow-sm"
                style={{
                  backgroundColor: 'var(--card-background)',
                  borderColor: 'var(--card-border)',
                  color: 'var(--card-foreground)',
                }}
              >
                {art.date ? (
                  <meta itemProp="datePublished" content={art.date} />
                ) : null}
                <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.35em] card-meta">
                  <span>{formatDate(art.date)}</span>
                  {hasAttempts ? (
                    <span
                      className="font-mono text-base tracking-[0.25em] card-foreground"
                      aria-label="Attempt glyphs"
                    >
                      {glyphRow}
                    </span>
                  ) : (
                    <span className="text-[10px] tracking-[0.35em] card-muted">
                      Not solved yet
                    </span>
                  )}
                </div>
                <div className="space-y-2 min-h-[56px]">
                  {hasAttempts && (
                    <div className="space-y-1">
                      <h2
                        itemProp="name"
                        className="text-base font-semibold tracking-tight card-foreground"
                      >
                        {titleText}
                      </h2>
                      <p
                        itemScope
                        itemType="https://schema.org/Person"
                        itemProp="creator"
                        className="text-sm card-meta"
                      >
                        <span itemProp="name">{artistText}</span>
                      </p>
                      {art.description && (
                        <p className="text-xs card-muted">
                          {art.description}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div className="relative aspect-[16/9] overflow-hidden rounded-xl bg-slate-200 dark:bg-slate-800">
                  <Image
                    src={art.cached_image_url || art.image_url}
                    alt={imageAlt}
                    className={`h-full w-full object-cover transition duration-500 ${
                      hasAttempts
                        ? 'filter-none'
                        : 'filter blur-sm brightness-90 saturate-0 contrast-75'
                    }`}
                    width={400}
                    height={267}
                    priority={false}
                    sizes="(max-width: 768px) 100vw, 50vw"
                    itemProp="image"
                  />
                  {!hasAttempts && (
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-slate-900/0 to-slate-950/60" />
                  )}
                </div>
                <Link
                  href={`/?date=${art.date ?? ''}`}
                  className="mt-auto inline-flex items-center justify-center rounded-full border border-dashed px-3 py-1 text-[10px] uppercase tracking-[0.35em] card-link border-slate-400 dark:border-slate-600"
                  rel="canonical"
                  itemProp="url"
                >
                  {hasAttempts ? 'Read more' : 'Replay this puzzle'}
                </Link>
              </article>
            )
          })}
        </div>
      </div>
    </div>
  )
}
