import { NextRequest, NextResponse } from 'next/server'

import { getCachedCommunityStats } from '@/lib/artCache'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const dailyIdParam = url.searchParams.get('dailyId')
  const dailyId = Number(dailyIdParam)

  if (!dailyIdParam || !Number.isFinite(dailyId)) {
    return NextResponse.json({ error: 'Invalid dailyId' }, { status: 400 })
  }

  const stats = await getCachedCommunityStats(dailyId)
  return NextResponse.json(stats)
}