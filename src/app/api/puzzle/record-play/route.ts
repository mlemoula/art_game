import { NextRequest, NextResponse } from 'next/server'

import { supabase } from '@/lib/supabaseClient'

type RecordPlayBody = {
  dailyId?: number
  userToken?: string
  attempts?: number
  success?: boolean
  attemptsData?: unknown
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as RecordPlayBody | null
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const dailyId = Number(body.dailyId)
  const userToken = typeof body.userToken === 'string' ? body.userToken.trim() : ''
  const attempts = Number(body.attempts)
  const success = Boolean(body.success)

  if (!Number.isFinite(dailyId) || !userToken || !Number.isFinite(attempts)) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('record_play_and_get_stats', {
    p_daily_id: dailyId,
    p_user_token: userToken,
    p_attempts: attempts,
    p_success: success,
    p_attempts_data: body.attemptsData ?? null,
  })

  if (error) {
    console.error('record-play: rpc failed', error)
    return NextResponse.json({ error: 'Unable to record play' }, { status: 500 })
  }

  const row = Array.isArray(data) ? data[0] : data
  const distributionRaw = (row?.distribution ?? {}) as Record<string, number>
  const distribution: Record<number, number> = {}
  Object.entries(distributionRaw).forEach(([key, value]) => {
    const parsedKey = Number(key)
    if (Number.isFinite(parsedKey)) distribution[parsedKey] = Number(value) || 0
  })

  return NextResponse.json({
    total: row?.total ?? 0,
    successCount: row?.success_count ?? 0,
    distribution,
  })
}