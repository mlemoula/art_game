import { NextRequest, NextResponse } from 'next/server'

import { getTodayDateKey, resolvePlayableDate } from '@/lib/dateUtils'
import { supabase } from '@/lib/supabaseClient'

type ArtistProfile = {
  name: string
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

const hashString = (value: string) => {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return hash
}

const shuffleWithSeed = <T,>(items: T[], seedInput: string) => {
  const next = [...items]
  let seed = hashString(seedInput) || 1
  for (let index = next.length - 1; index > 0; index -= 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    const swapIndex = seed % (index + 1)
    ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
  }
  return next
}

const fetchArtistProfile = async (name: string): Promise<ArtistProfile | null> => {
  if (!name) return null

  const { data } = await supabase
    .from('artists')
    .select('name,movement,country,birth_year,death_year,popularity_score')
    .ilike('name', name)
    .maybeSingle()

  if (!data) return null

  return {
    name: typeof data.name === 'string' ? data.name : name,
    movement: typeof data.movement === 'string' ? data.movement : null,
    country: typeof data.country === 'string' ? data.country : null,
    birth_year: typeof data.birth_year === 'number' ? data.birth_year : null,
    death_year: typeof data.death_year === 'number' ? data.death_year : null,
    popularity_score:
      typeof data.popularity_score === 'number' ? data.popularity_score : null,
  }
}

const buildFinalAttemptChoices = ({
  targetArtist,
  targetProfile,
  candidatePool,
  usedGuesses,
  seed,
}: {
  targetArtist: string
  targetProfile: ArtistProfile | null
  candidatePool: ArtistProfile[]
  usedGuesses: Set<string>
  seed: string
}) => {
  const targetKey = normalizeString(targetArtist)
  const remainingCandidates = candidatePool.filter((artist) => {
    const name = artist.name?.trim()
    if (!name) return false
    const key = normalizeString(name)
    return key !== targetKey && !usedGuesses.has(key)
  })

  const scoreCandidate = (artist: ArtistProfile) => {
    let score = 0
    if (
      targetProfile?.movement &&
      artist.movement &&
      normalizeString(targetProfile.movement) === normalizeString(artist.movement)
    ) {
      score += 4
    }
    if (
      targetProfile?.country &&
      artist.country &&
      normalizeString(targetProfile.country) === normalizeString(artist.country)
    ) {
      score += 3
    }
    if (
      typeof targetProfile?.birth_year === 'number' &&
      typeof artist.birth_year === 'number'
    ) {
      score += Math.max(
        0,
        2 - Math.floor(Math.abs(targetProfile.birth_year - artist.birth_year) / 25)
      )
    }
    return score
  }

  const rankedCandidates = [...remainingCandidates].sort((left, right) => {
    const scoreDelta = scoreCandidate(right) - scoreCandidate(left)
    if (scoreDelta !== 0) return scoreDelta
    return left.name.localeCompare(right.name)
  })

  const distractors = rankedCandidates.slice(0, 3).map((artist) => artist.name)
  if (distractors.length < 3) {
    const usedNames = new Set(
      [targetArtist, ...distractors].map((name) => normalizeString(name))
    )
    for (const artist of candidatePool) {
      const name = artist.name?.trim()
      if (!name) continue
      const key = normalizeString(name)
      if (usedNames.has(key) || usedGuesses.has(key)) continue
      distractors.push(name)
      usedNames.add(key)
      if (distractors.length === 3) break
    }
  }

  if (distractors.length < 3) return []

  return shuffleWithSeed([targetArtist, ...distractors], seed)
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
    .select('artist')
    .eq('date', playableDate)
    .maybeSingle()

  if (error || !artwork?.artist) {
    return NextResponse.json({ error: 'Puzzle answer unavailable' }, { status: 404 })
  }

  const targetArtist = artwork.artist.trim()
  const targetProfile = await fetchArtistProfile(targetArtist)
  const { data: candidatePool } = await supabase
    .from('artists')
    .select('name,movement,country,birth_year,death_year,popularity_score')
    .neq('name', targetArtist)
    .order('name', { ascending: true })
    .limit(1000)

  const usedGuesses = new Set(
    Array.isArray(body.usedGuesses)
      ? body.usedGuesses
          .filter((value: unknown): value is string => typeof value === 'string')
          .map((value) => normalizeString(value))
      : []
  )

  const options = buildFinalAttemptChoices({
    targetArtist,
    targetProfile,
    candidatePool: Array.isArray(candidatePool)
      ? (candidatePool as ArtistProfile[])
      : [],
    usedGuesses,
    seed: `${playableDate}:${usedGuesses.size}`,
  })

  return NextResponse.json({ options })
}
