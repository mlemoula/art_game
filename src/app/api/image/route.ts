import sharp from 'sharp'
import { NextRequest, NextResponse } from 'next/server'

const CACHE_CONTROL = 'public, max-age=0, s-maxage=31536000, stale-while-revalidate=86400'
const DEFAULT_WIDTH = 1600
const MAX_WIDTH = 2200
const DEFAULT_QUALITY = 78
const MIN_QUALITY = 40
const MAX_QUALITY = 90

const clampInteger = (value: string | null, fallback: number, min: number, max: number) => {
  const parsed = Number.parseInt(value ?? '', 10)
  if (Number.isNaN(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

const isAllowedSourceUrl = (value: string) => {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return false
    return (
      url.hostname === 'orrbvrpvawnbmirbyaxu.supabase.co' &&
      url.pathname.startsWith('/storage/v1/object/public/generated-artworks/')
    )
  } catch {
    return false
  }
}

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const src = request.nextUrl.searchParams.get('src')
    if (!src || !isAllowedSourceUrl(src)) {
      return NextResponse.json({ error: 'Invalid image source' }, { status: 400 })
    }

    const width = clampInteger(
      request.nextUrl.searchParams.get('w'),
      DEFAULT_WIDTH,
      320,
      MAX_WIDTH
    )
    const quality = clampInteger(
      request.nextUrl.searchParams.get('q'),
      DEFAULT_QUALITY,
      MIN_QUALITY,
      MAX_QUALITY
    )

    const imageResponse = await fetch(src)
    if (!imageResponse.ok) {
      return NextResponse.json({ error: 'Unable to fetch image' }, { status: 502 })
    }

    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer())
    const optimizedBuffer = await sharp(imageBuffer)
      .rotate()
      .resize({
        width,
        withoutEnlargement: true,
        fit: 'inside',
      })
      .webp({ quality })
      .toBuffer()

    return new NextResponse(new Uint8Array(optimizedBuffer), {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': CACHE_CONTROL,
      },
    })
  } catch (error) {
    console.error('Image proxy: unexpected error', error)
    return NextResponse.json(
      { error: 'Failed to optimize image' },
      { status: 500 }
    )
  }
}
