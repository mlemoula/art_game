// src/app/api/today/route.ts
import { supabase } from '@/lib/supabaseClient'
import { NextResponse } from 'next/server'

export async function GET() {
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('daily_art')
    .select('*')
    .eq('date', todayStr)
    .single()

  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500
    return NextResponse.json({ error: error.message }, { status })
  }
  return NextResponse.json(data)
}
