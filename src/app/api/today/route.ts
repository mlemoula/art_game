// src/app/api/today/route.ts
import { supabase } from '@/lib/supabaseClient'
import { NextRequest, NextResponse } from 'next/server'

const isValidDate = (value: string) => {
  if (!value) return false
  const date = new Date(value)
  return !Number.isNaN(date.getTime())
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const dateQuery = url.searchParams.get('date')
  const offsetQuery = url.searchParams.get('offset')

  let targetDate = new Date()

  if (offsetQuery) {
    const offset = Number(offsetQuery)
    if (!Number.isNaN(offset)) {
      const copy = new Date(targetDate)
      copy.setDate(copy.getDate() + offset)
      targetDate = copy
    }
  }

  if (dateQuery && isValidDate(dateQuery)) {
    targetDate = new Date(dateQuery)
  }

  const todayStr = new Date().toISOString().split('T')[0]
  const targetStr = targetDate.toISOString().split('T')[0]

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
