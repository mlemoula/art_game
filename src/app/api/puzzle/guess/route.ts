import { NextRequest, NextResponse } from 'next/server'

import { getTodayDateKey, resolvePlayableDate } from '@/lib/dateUtils'
import {
  getCachedDailyArtwork,
  getCachedArtistProfile,
  getCachedCanonicalArtistName,
  type ArtistProfile,
} from '@/lib/artCache'

const MAX_ATTEMPTS = 5
const ASSUMED_MAX_ARTIST_AGE = 85

type FeedbackStatus = 'match' | 'earlier' | 'later' | 'different' | 'info' | 'missing'

type FeedbackDetail = {
  label: string
  value: string
  status: FeedbackStatus
}

const normalizeString = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()

const normalizeGuess = (value: unknown) =>
  typeof value === 'string' ? value.trim() : ''

const parseAttemptsUsed = (value: unknown) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0
  return Math.max(0, Math.floor(value))
}

const buildFeedback = ({
  guessedProfile,
  targetProfile,
  guessName,
  artYear,
}: {
  guessedProfile: ArtistProfile | null
  targetProfile: ArtistProfile | null
  guessName: string
  artYear: string | null
}): FeedbackDetail[] => {
  const feedback: FeedbackDetail[] = []
  const pushDetail = (label: string, value: string, status: FeedbackStatus) => {
    feedback.push({ label, value, status })
  }

  const guessedBirth = guessedProfile?.birth_year ?? null
  const guessedDeath = guessedProfile?.death_year ?? null
  const artYearNumber = artYear ? Number.parseInt(artYear, 10) : Number.NaN

  if (guessedBirth !== null) {
    const aliveDuringPainting =
      guessedDeath !== null &&
      Number.isFinite(artYearNumber) &&
      artYearNumber >= guessedBirth &&
      artYearNumber <= guessedDeath
    pushDetail('Birth year', String(guessedBirth), aliveDuringPainting ? 'match' : 'info')
  } else {
    pushDetail('Birth year', '—', 'missing')
  }

  if (guessedDeath !== null) {
    pushDetail(
      'Death year',
      String(guessedDeath),
      Number.isFinite(artYearNumber) && artYearNumber > guessedDeath ? 'earlier' : 'info'
    )
  } else {
    pushDetail('Death year', '—', 'missing')
  }

  if (Number.isFinite(artYearNumber) && (guessedBirth !== null || guessedDeath !== null)) {
    const fallbackDeath =
      guessedBirth !== null
        ? Math.min(guessedBirth + ASSUMED_MAX_ARTIST_AGE, new Date().getUTCFullYear())
        : null
    const deathYear = guessedDeath ?? fallbackDeath

    if (guessedBirth !== null && artYearNumber < guessedBirth) {
      pushDetail('Era hint', 'Try an older artist', 'earlier')
    } else if (deathYear !== null && artYearNumber > deathYear) {
      pushDetail('Era hint', 'Try a more recent artist', 'later')
    } else {
      pushDetail('Era hint', 'Within their lifetime', 'match')
    }
  }

  const compareField = (
    label: string,
    targetValue: string | null | undefined,
    guessValue: string | null | undefined
  ) => {
    if (!guessValue) {
      pushDetail(label, '—', 'missing')
      return
    }
    if (!targetValue) {
      pushDetail(label, guessValue, 'info')
      return
    }
    const isMatch = normalizeString(targetValue) === normalizeString(guessValue)
    pushDetail(label, guessValue, isMatch ? 'match' : 'different')
  }

  compareField('Movement', targetProfile?.movement, guessedProfile?.movement)
  compareField('Country', targetProfile?.country, guessedProfile?.country)

  const targetPopularity = targetProfile?.popularity_score ?? null
  const guessedPopularity = guessedProfile?.popularity_score ?? null
  if (targetPopularity !== null && guessedPopularity !== null) {
    const delta = guessedPopularity - targetPopularity
    const threshold = 7
    if (Math.abs(delta) <= threshold) {
      pushDetail('Fame hint', 'Similar fame', 'match')
    } else if (delta > threshold) {
      pushDetail('Fame hint', 'Artist of the day is less famous', 'different')
    } else {
      pushDetail('Fame hint', 'Try a more famous artist', 'different')
    }
  } else {
    pushDetail('Fame hint', '—', 'missing')
  }

  if (!guessedProfile) {
    pushDetail('Data', `No reference yet for "${guessName}".`, 'info')
  }

  return feedback
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const dateValue = typeof body.date === 'string' ? body.date : getTodayDateKey()
  const playableDate = resolvePlayableDate(dateValue)
  if (!playableDate) {
    return NextResponse.json({ error: 'Puzzle not found' }, { status: 404 })
  }

  const giveUp = Boolean(body.giveUp)
  const guess = giveUp ? '' : normalizeGuess(body.guess)

  // ── Round 1: parallel ─────────────────────────────────────────────────────
  // Artwork (cached) + canonical name resolution (cached) run simultaneously.
  // Skip canonical lookup entirely on give-up to save a round-trip.
  const [artwork, canonicalGuess] = await Promise.all([
    getCachedDailyArtwork(playableDate),
    giveUp ? Promise.resolve(null) : getCachedCanonicalArtistName(guess),
  ])

  if (!artwork) {
    return NextResponse.json({ error: 'Puzzle not found' }, { status: 404 })
  }

  const targetArtist = artwork.artist
  if (!targetArtist) {
    return NextResponse.json({ error: 'Puzzle answer unavailable' }, { status: 500 })
  }

  // ── Give-up path ──────────────────────────────────────────────────────────
  if (giveUp) {
    const targetProfile = await getCachedArtistProfile(targetArtist)
    return NextResponse.json({
      correct: false,
      finished: true,
      success: false,
      feedback: [] as FeedbackDetail[],
      revealedArtwork: {
        title: artwork.title,
        artist: targetArtist,
        year: artwork.year,
        museum: artwork.museum,
        wiki_summary_url: artwork.wiki_summary_url,
        wiki_artist_summary_url: artwork.wiki_artist_summary_url,
        target_profile: targetProfile,
      },
    })
  }

  // ── Normal guess path ─────────────────────────────────────────────────────
  if (!canonicalGuess) {
    return NextResponse.json(
      { error: 'Choose an artist from the suggestions list.' },
      { status: 400 }
    )
  }

  const attemptsUsed = parseAttemptsUsed(body.attemptsUsed)
  if (attemptsUsed >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: 'No more attempts remaining' }, { status: 400 })
  }

  const guessNorm = normalizeString(canonicalGuess)
  const targetNorm = normalizeString(targetArtist)
  const targetLastName = normalizeString(targetArtist.split(' ').filter(Boolean).pop() || '')
  const correct = guessNorm === targetNorm || (!!targetLastName && guessNorm === targetLastName)

  // ── Round 2: parallel ─────────────────────────────────────────────────────
  // Target profile (always needed for reveal) + guessed profile (only if wrong)
  // both served from cache → single network call each at most.
  const [targetProfile, guessedProfile] = await Promise.all([
    getCachedArtistProfile(targetArtist),
    correct ? Promise.resolve(null) : getCachedArtistProfile(canonicalGuess),
  ])

  const revealPayload = {
    title: artwork.title,
    artist: targetArtist,
    year: artwork.year,
    museum: artwork.museum,
    wiki_summary_url: artwork.wiki_summary_url,
    wiki_artist_summary_url: artwork.wiki_artist_summary_url,
    target_profile: targetProfile,
  }

  const feedback = correct
    ? ([] as FeedbackDetail[])
    : buildFeedback({
        guessedProfile,
        targetProfile,
        guessName: canonicalGuess,
        artYear: artwork.year,
      })

  const nextAttempts = attemptsUsed + 1
  const finished = correct || nextAttempts >= MAX_ATTEMPTS

  return NextResponse.json({
    correct,
    finished,
    success: correct,
    feedback,
    canonicalGuess,
    revealedArtwork: finished ? revealPayload : null,
  })
}
