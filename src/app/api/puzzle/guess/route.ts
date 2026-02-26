import { NextRequest, NextResponse } from 'next/server'

import { getTodayDateKey, resolvePlayableDate } from '@/lib/dateUtils'
import { supabase } from '@/lib/supabaseClient'

const MAX_ATTEMPTS = 5
const ASSUMED_MAX_ARTIST_AGE = 85

type FeedbackStatus = 'match' | 'earlier' | 'later' | 'different' | 'info' | 'missing'

type FeedbackDetail = {
  label: string
  value: string
  status: FeedbackStatus
}

type ArtistProfile = {
  movement: string | null
  country: string | null
  birth_year: number | null
  death_year: number | null
  popularity_score: number | null
}

const normalizeString = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

const normalizeGuess = (value: unknown) =>
  typeof value === 'string' ? value.trim() : ''

const parseAttemptsUsed = (value: unknown) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0
  return Math.max(0, Math.floor(value))
}

const fetchArtistProfile = async (name: string): Promise<ArtistProfile | null> => {
  if (!name) return null
  const { data: exact, error: exactError } = await supabase
    .from('artists')
    .select('movement, country, birth_year, death_year, popularity_score')
    .ilike('name', name)
    .maybeSingle()
  if (exact) {
    return {
      movement: typeof exact.movement === 'string' ? exact.movement : null,
      country: typeof exact.country === 'string' ? exact.country : null,
      birth_year: typeof exact.birth_year === 'number' ? exact.birth_year : null,
      death_year: typeof exact.death_year === 'number' ? exact.death_year : null,
      popularity_score:
        typeof exact.popularity_score === 'number' ? exact.popularity_score : null,
    }
  }
  if (exactError && exactError.code !== 'PGRST116') return null

  const { data: fuzzyRows } = await supabase
    .from('artists')
    .select('movement, country, birth_year, death_year, popularity_score')
    .ilike('name', `%${name}%`)
    .order('popularity_score', { ascending: false })
    .limit(1)

  const fuzzy = fuzzyRows?.[0]
  if (!fuzzy) return null
  return {
    movement: typeof fuzzy.movement === 'string' ? fuzzy.movement : null,
    country: typeof fuzzy.country === 'string' ? fuzzy.country : null,
    birth_year: typeof fuzzy.birth_year === 'number' ? fuzzy.birth_year : null,
    death_year: typeof fuzzy.death_year === 'number' ? fuzzy.death_year : null,
    popularity_score:
      typeof fuzzy.popularity_score === 'number' ? fuzzy.popularity_score : null,
  }
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

  const { data: artwork, error } = await supabase
    .from('daily_art')
    .select(
      'id, date, title, artist, year, museum, image_url, cached_image_url, wiki_summary_url, wiki_artist_summary_url'
    )
    .eq('date', playableDate)
    .maybeSingle()
  if (error || !artwork) {
    return NextResponse.json({ error: 'Puzzle not found' }, { status: 404 })
  }

  const targetArtist = typeof artwork.artist === 'string' ? artwork.artist.trim() : ''
  if (!targetArtist) {
    return NextResponse.json({ error: 'Puzzle answer unavailable' }, { status: 500 })
  }

  const targetProfile = await fetchArtistProfile(targetArtist)
  const artistInitial = targetArtist ? targetArtist.charAt(0).toUpperCase() : null
  const revealPayload = {
    title: typeof artwork.title === 'string' ? artwork.title : null,
    artist: targetArtist,
    year: typeof artwork.year === 'string' ? artwork.year : null,
    museum: typeof artwork.museum === 'string' ? artwork.museum : null,
    wiki_summary_url:
      typeof artwork.wiki_summary_url === 'string' ? artwork.wiki_summary_url : null,
    wiki_artist_summary_url:
      typeof artwork.wiki_artist_summary_url === 'string'
        ? artwork.wiki_artist_summary_url
        : null,
    artist_initial: artistInitial,
    target_profile: targetProfile,
  }

  const giveUp = Boolean(body.giveUp)
  if (giveUp) {
    return NextResponse.json({
      correct: false,
      finished: true,
      success: false,
      feedback: [] as FeedbackDetail[],
      revealedArtwork: revealPayload,
    })
  }

  const guess = normalizeGuess(body.guess)
  if (!guess) {
    return NextResponse.json({ error: 'Guess is required' }, { status: 400 })
  }

  const attemptsUsed = parseAttemptsUsed(body.attemptsUsed)
  const guessNorm = normalizeString(guess)
  const targetNorm = normalizeString(targetArtist)
  const targetLastName = normalizeString(targetArtist.split(' ').filter(Boolean).pop() || '')
  const correct = guessNorm === targetNorm || (targetLastName && guessNorm === targetLastName)

  const guessedProfile = correct ? targetProfile : await fetchArtistProfile(guess)
  const feedback = correct
    ? ([] as FeedbackDetail[])
    : buildFeedback({
        guessedProfile,
        targetProfile,
        guessName: guess,
        artYear: typeof artwork.year === 'string' ? artwork.year : null,
      })

  const nextAttempts = attemptsUsed + 1
  const finished = correct || nextAttempts >= MAX_ATTEMPTS

  return NextResponse.json({
    correct,
    finished,
    success: correct,
    feedback,
    revealedArtwork: finished ? revealPayload : null,
  })
}
