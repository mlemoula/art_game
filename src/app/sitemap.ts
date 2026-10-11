import type { MetadataRoute } from 'next'

import { getTodayDateKey } from '@/lib/dateUtils'
import { supabase } from '@/lib/supabaseClient'

const APP_BASE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://signalbeat.studio').replace(/\/+$/, '')

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

  const dates = data
    .map((entry) => entry.date)
    .filter((date): date is string => Boolean(date))

  const puzzleEntries: MetadataRoute.Sitemap = dates.map((date) => ({
    url: `${APP_BASE_URL}/puzzle/${encodeURIComponent(date)}`,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
    lastModified: new Date(`${date}T00:00:00.000Z`),
  }))

  const solutionEntries: MetadataRoute.Sitemap = dates.map((date) => ({
    url: buildSolutionUrl(date),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
    lastModified: new Date(`${date}T00:00:00.000Z`),
  }))

  return [...baseEntries, ...puzzleEntries, ...solutionEntries]
}
