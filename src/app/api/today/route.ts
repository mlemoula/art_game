// src/app/api/today/route.ts
import { supabase } from '@/lib/supabaseClient'
import { NextRequest, NextResponse } from 'next/server'
import { getTodayDateKey, resolvePlayableDate } from '@/lib/dateUtils'

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
    .select('*')
    .eq('date', targetStr)
    .maybeSingle()

  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500
    return NextResponse.json({ error: error.message }, { status })
  }
  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(data)
}
