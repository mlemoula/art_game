import { NextRequest, NextResponse } from 'next/server'

import { getTodayDateKey } from '@/lib/dateUtils'
import { supabase } from '@/lib/supabaseClient'

const parseDates = (value?: string | null) => {
  if (!value) return []
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry): entry is string => entry.length > 0)
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const dates = parseDates(url.searchParams.get('dates'))

  if (!dates.length) {
    return NextResponse.json({ availableDates: [] })
  }

  const { data, error } = await supabase
    .from('daily_art')
    .select('date')
    .in('date', dates)
    .lte('date', getTodayDateKey())

  if (error) {
    console.error('Archive availability lookup failed', error)
    return NextResponse.json({ availableDates: [] }, { status: 500 })
  }

  const availableDates = Array.from(
    new Set(
      (data ?? [])
        .map((entry) => entry.date)
        .filter((entry): entry is string => Boolean(entry))
    )
  )

  return NextResponse.json({ availableDates })
}
