import sharp from 'sharp'
import { NextRequest, NextResponse } from 'next/server'

import { supabase } from '@/lib/supabaseClient'

const CANVAS_WIDTH = 1200
const CANVAS_HEIGHT = 630
const DETAIL_RATIO = 0.65
const CACHE_CONTROL = 'public, max-age=0, s-maxage=31536000, immutable'

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

    const finalImage = await sharp(imageBuffer)
      .extract({ left, top, width: cropWidth, height: cropHeight })
      .resize(CANVAS_WIDTH, CANVAS_HEIGHT, { fit: 'cover' })
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
