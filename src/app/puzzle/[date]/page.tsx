import { notFound } from 'next/navigation'

import Home from '@/app/page.client'
import { buildPuzzleMetadataForDate } from '@/app/metadata'
import { resolvePlayableDate } from '@/lib/dateUtils'

type PuzzlePageProps = {
  params: Promise<{ date: string }>
}

export async function generateMetadata({ params }: PuzzlePageProps) {
  const { date } = await params
  const playableDate = resolvePlayableDate(date)
  return buildPuzzleMetadataForDate(playableDate ?? undefined)
}

export const dynamic = 'force-dynamic'

export default async function PuzzlePage({ params }: PuzzlePageProps) {
  const { date } = await params
  const playableDate = resolvePlayableDate(date)
  if (!playableDate) {
    notFound()
  }

  return <Home initialDate={playableDate} />
}
