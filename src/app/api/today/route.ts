// src/app/api/today/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getTodayDateKey, resolvePlayableDate } from '@/lib/dateUtils'
import {
  getCachedDailyArtwork,
  getCachedArtistProfile,
  getCachedMovementPeers,
  getCachedPuzzleNumber,
} from '@/lib/artCache'

type PuzzlePayload = {
  id: number
  date: string
  image_url: string
  cached_image_url: string | null
  year: string | null
  museum: string | null
  puzzle_number: number | null
  target_profile: {
    movement: string | null
    country: string | null
    birth_year: number | null
    death_year: number | null
    popularity_score: number | null
    movement_peers: string[]
  } | null
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const dateQuery = url.searchParams.get('date')
  const offsetQuery = url.searchParams.get('offset')

  const todayStr = getTodayDateKey()
  let targetStr = todayStr

  if (offsetQuery) {
    const offset = Number(offsetQuery)
    if (!Number.isNaN(offset)) {
      const copy = new Date(`${todayStr}T00:00:00Z`)
      copy.setUTCDate(copy.getUTCDate() + offset)
      targetStr = copy.toISOString().slice(0, 10)
    }
  }

  if (dateQuery) {
    const playableDate = resolvePlayableDate(dateQuery)
    if (!playableDate) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    targetStr = playableDate
  }

  if (targetStr > todayStr) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // ── Step 1: artwork + puzzle number (parallel, both cached) ─────────────
  const [artwork, puzzleNumber] = await Promise.all([
    getCachedDailyArtwork(targetStr),
    getCachedPuzzleNumber(targetStr),
  ])
  if (!artwork) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const artistName = artwork.artist

  // ── Step 2: artist profile + movement peers (parallel, both cached) ───────
  let targetProfile: PuzzlePayload['target_profile'] = null

  if (artistName) {
    const artistData = await getCachedArtistProfile(artistName)

    if (artistData) {
      const movement = artistData.movement

      // Fetch movement peers in parallel with nothing else left to do —
      // but avoid the extra query when there's no movement to look up.
      const movementPeers = movement
        ? await getCachedMovementPeers(movement, artistName)
        : []

      targetProfile = {
        movement,
        country: artistData.country,
        birth_year: artistData.birth_year,
        death_year: artistData.death_year,
        popularity_score: artistData.popularity_score,
        movement_peers: movementPeers,
      }
    }
  }

  const payload: PuzzlePayload = {
    id: artwork.id,
    date: artwork.date,
    image_url: artwork.image_url,
    cached_image_url: artwork.cached_image_url,
    year: artwork.year,
    museum: artwork.museum,
    puzzle_number: puzzleNumber,
    target_profile: targetProfile,
  }

  return NextResponse.json(payload)
}
