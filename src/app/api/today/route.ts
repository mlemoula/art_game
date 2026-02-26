// src/app/api/today/route.ts
import { supabase } from '@/lib/supabaseClient'
import { NextRequest, NextResponse } from 'next/server'
import { getTodayDateKey, resolvePlayableDate } from '@/lib/dateUtils'

type PuzzlePayload = {
  id: number
  date: string
  image_url: string
  cached_image_url: string | null
  year: string | null
  museum: string | null
  artist_initial: string | null
  target_profile: {
    movement: string | null
    country: string | null
    birth_year: number | null
    death_year: number | null
    popularity_score: number | null
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

  const { data, error } = await supabase
    .from('daily_art')
    .select('id, date, image_url, cached_image_url, year, museum, artist')
    .eq('date', targetStr)
    .maybeSingle()

  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500
    return NextResponse.json({ error: error.message }, { status })
  }
  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const artistName = typeof data.artist === 'string' ? data.artist.trim() : ''
  const artistInitial = artistName ? artistName.charAt(0).toUpperCase() : null

  let targetProfile: PuzzlePayload['target_profile'] = null
  if (artistName) {
    const { data: artistData } = await supabase
      .from('artists')
      .select('movement, country, birth_year, death_year, popularity_score')
      .ilike('name', artistName)
      .maybeSingle()
    if (artistData) {
      targetProfile = {
        movement: typeof artistData.movement === 'string' ? artistData.movement : null,
        country: typeof artistData.country === 'string' ? artistData.country : null,
        birth_year: typeof artistData.birth_year === 'number' ? artistData.birth_year : null,
        death_year: typeof artistData.death_year === 'number' ? artistData.death_year : null,
        popularity_score:
          typeof artistData.popularity_score === 'number'
            ? artistData.popularity_score
            : null,
      }
    }
  }

  const payload: PuzzlePayload = {
    id: data.id,
    date: data.date,
    image_url: data.image_url,
    cached_image_url:
      typeof data.cached_image_url === 'string' ? data.cached_image_url : null,
    year: typeof data.year === 'string' ? data.year : null,
    museum: typeof data.museum === 'string' ? data.museum : null,
    artist_initial: artistInitial,
    target_profile: targetProfile,
  }

  return NextResponse.json(payload)
}
