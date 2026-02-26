import type { MetadataRoute } from 'next'

import { getTodayDateKey } from '@/lib/dateUtils'
import { supabase } from '@/lib/supabaseClient'

const APP_BASE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://whopaintedthis.vercel.app').replace(/\/+$/, '')

export const revalidate = 3600

const buildSolutionUrl = (date: string) =>
  `${APP_BASE_URL}/puzzle/${encodeURIComponent(date)}/solution`

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const today = getTodayDateKey()
  const baseEntries: MetadataRoute.Sitemap = [
    {
      url: `${APP_BASE_URL}/`,
      changeFrequency: 'daily',
      priority: 1,
      lastModified: new Date(`${today}T00:00:00.000Z`),
    },
    {
      url: `${APP_BASE_URL}/archive`,
      changeFrequency: 'daily',
      priority: 0.8,
      lastModified: new Date(`${today}T00:00:00.000Z`),
    },
  ]

  const { data, error } = await supabase
    .from('daily_art')
    .select('date')
    .lt('date', today)
    .order('date', { ascending: false })
    .limit(5000)

  if (error || !data) {
    return baseEntries
  }

  const solutionEntries: MetadataRoute.Sitemap = data
    .map((entry) => entry.date)
    .filter((date): date is string => Boolean(date))
    .map((date) => ({
      url: buildSolutionUrl(date),
      changeFrequency: 'monthly',
      priority: 0.7,
      lastModified: new Date(`${date}T00:00:00.000Z`),
    }))

  return [...baseEntries, ...solutionEntries]
}
