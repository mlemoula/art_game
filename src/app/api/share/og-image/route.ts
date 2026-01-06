import sharp from 'sharp'
import { NextRequest, NextResponse } from 'next/server'

import { supabase } from '@/lib/supabaseClient'

const CANVAS_WIDTH = 1200
const CANVAS_HEIGHT = 630
const DETAIL_RATIO = 0.65
const CACHE_CONTROL = 'public, max-age=0, s-maxage=86400, stale-while-revalidate=86400'

const normalizeDateValue = (value?: string) => {
  if (!value) return ''
  return value.trim().split('T')[0]
}

const fetchArtwork = async (date?: string | null) => {
  const today = new Date().toISOString().split('T')[0]
  const builder = supabase
    .from('daily_art')
    .select('id, date, image_url, cached_image_url')
    .order('date', { ascending: false })

  if (date) {
    builder.eq('date', date)
  } else {
    builder.lte('date', today)
  }

  const { data, error } = await builder.maybeSingle()
  if (error) {
    return { error }
  }
  return { data }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const dateParam = normalizeDateValue(url.searchParams.get('date') ?? undefined)
    const { data, error } = await fetchArtwork(dateParam || undefined)
    if (error) {
      console.error('OG image: unable to fetch artwork', error)
      return NextResponse.json(
        { error: 'Unable to fetch artwork for OG image' },
        { status: 500 }
      )
    }
    if (!data) {
      return NextResponse.json({ error: 'Artwork not found' }, { status: 404 })
    }

    const imageUrl = data.cached_image_url || data.image_url
    if (!imageUrl) {
      return NextResponse.json({ error: 'No artwork image available' }, { status: 404 })
    }

    const imageResponse = await fetch(imageUrl)
    if (!imageResponse.ok) {
      console.error('OG image: failed to download source image', imageUrl)
      return NextResponse.json(
        { error: 'Unable to download artwork image' },
        { status: 502 }
      )
    }

    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer())
    const metadata = await sharp(imageBuffer).metadata()
    if (!metadata.width || !metadata.height) {
      return NextResponse.json(
        { error: 'Unable to determine artwork dimensions' },
        { status: 422 }
      )
    }
    const width = metadata.width
    const height = metadata.height

    const cropWidth = Math.max(1, Math.min(width - 1, Math.floor(width * DETAIL_RATIO)))
    const cropHeight = Math.max(1, Math.min(height - 1, Math.floor(height * DETAIL_RATIO)))
    const left = Math.max(0, Math.floor((width - cropWidth) / 2))
    const top = Math.max(0, Math.floor((height - cropHeight) / 2))

    const overlayText = `
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}"
        width="${CANVAS_WIDTH}"
        height="${CANVAS_HEIGHT}"
      >
        <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(0,0,0,0)" />
          <stop offset="80%" stop-color="rgba(0,0,0,0.7)" />
        </linearGradient>
        <rect
          x="0"
          y="${Math.floor(CANVAS_HEIGHT * 0.65)}"
          width="${CANVAS_WIDTH}"
          height="${Math.floor(CANVAS_HEIGHT * 0.35)}"
          fill="url(#fade)"
        />
        <text
          x="40"
          y="${CANVAS_HEIGHT - 40}"
          font-size="38"
          font-family="Inter, Helvetica, Arial, sans-serif"
          fill="#fdfdfd"
          font-weight="600"
          letter-spacing="1.5"
        >
          4rtw0rk · One-minute art puzzle
        </text>
      </svg>
    `

    const finalImage = await sharp(imageBuffer)
      .extract({ left, top, width: cropWidth, height: cropHeight })
      .resize(CANVAS_WIDTH, CANVAS_HEIGHT, { fit: 'cover' })
      .composite([{ input: Buffer.from(overlayText), blend: 'over' }])
      .jpeg({ quality: 78 })
      .toBuffer()

    const responseBody = new Uint8Array(finalImage)

    return new NextResponse(responseBody, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': CACHE_CONTROL,
      },
    })
  } catch (error) {
    console.error('OG image: unexpected error', error)
    return NextResponse.json(
      { error: 'Failed to generate OG image' },
      { status: 500 }
    )
  }
}
