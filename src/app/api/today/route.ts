// src/app/api/today/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getTodayDateKey, resolvePlayableDate } from '@/lib/dateUtils'
import {
  getCachedDailyArtwork,
  getCachedArtistProfile,
  getCachedMovementPeers,
  getCachedPuzzleNumber,
  getLatestArtworkDateOnOrBefore,
} from '@/lib/artCache'

type PuzzlePayload = {
  id: number
  date: string
  image_url: string
  cached_image_url: string | null
  year: string | null
  museum: string | null
  puzzle_number: number | null
  fallback?: boolean // true when today had no puzzle and the latest available one is served
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

  // ── Step 1: artwork, then its puzzle number ──────────────────────────────
  // The number is read only once the artwork exists: for a date without a puzzle the count equals
  // the previous day's, and caching it would give the wrong number after the queue is refilled.
  let artwork = await getCachedDailyArtwork(targetStr)

  // "Today" with an empty queue (nothing scheduled for today): serve the latest available puzzle
  // instead of a dead "Not found" page. Explicit ?date= / ?offset= requests keep their strict 404.
  let isFallback = false
  if (!artwork && !dateQuery && targetStr === todayStr) {
    const latestDate = await getLatestArtworkDateOnOrBefore(todayStr)
    if (latestDate && latestDate !== targetStr) {
      artwork = await getCachedDailyArtwork(latestDate)
      isFallback = Boolean(artwork)
    }
  }
  if (!artwork) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const puzzleNumber = await getCachedPuzzleNumber(artwork.date)

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
    ...(isFallback ? { fallback: true } : {}),
    target_profile: targetProfile,
  }

  return NextResponse.json(payload)
}
