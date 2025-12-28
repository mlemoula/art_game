import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import sharp from 'sharp'

const ALLOWED_HOSTNAMES = new Set([
  'upload.wikimedia.org',
  'commons.wikimedia.org',
])
const MAX_WIDTH = 3200

const sanitizeWidth = (value: string | number | undefined) => {
  if (value == null) return undefined
  const numeric =
    typeof value === 'number' ? value : Number.parseInt(String(value), 10)
  if (Number.isNaN(numeric) || numeric <= 0) return undefined
  return Math.min(MAX_WIDTH, Math.max(64, Math.round(numeric)))
}

const decodeBase64Url = (value: string) => {
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
    const padding = base64.length % 4
    const padded = padding === 0 ? base64 : `${base64}${'='.repeat(4 - padding)}`
    return Buffer.from(padded, 'base64').toString('utf8')
  } catch {
    return ''
  }
}

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      encoded?: string[]
    }>
  }
) {
  const pathSegments = (await params)?.encoded ?? []
  if (!pathSegments.length) {
    return NextResponse.json(
      { error: 'Missing encoded image segments' },
      { status: 400 }
    )
  }

  let width: number | undefined
  let encodedSegments = pathSegments
  const widthMatch = pathSegments[0]?.match(/^w(\d+)$/i)
  if (widthMatch) {
    width = sanitizeWidth(widthMatch[1])
    encodedSegments = pathSegments.slice(1)
  }

  const encodedPayload = encodedSegments.join('/')
  if (!encodedPayload) {
    return NextResponse.json(
      { error: 'Encoded image path is empty' },
      { status: 400 }
    )
  }

  const decodedUrl = decodeBase64Url(decodeURIComponent(encodedPayload))
  if (!decodedUrl) {
    return NextResponse.json({ error: 'Unable to decode image url' }, { status: 400 })
  }

  let remoteUrl: URL
  try {
    remoteUrl = new URL(decodedUrl)
  } catch {
    return NextResponse.json({ error: 'Invalid image url' }, { status: 400 })
  }

  if (!ALLOWED_HOSTNAMES.has(remoteUrl.hostname)) {
    return NextResponse.json(
      { error: 'Image host not supported' },
      { status: 400 }
    )
  }

  const response = await fetch(remoteUrl.toString(), {
    redirect: 'follow',
    headers: {
      accept: 'image/*',
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 4rtW0rk',
    },
  })

  if (!response.ok) {
    return NextResponse.json(
      { error: 'Failed to fetch remote image' },
      { status: response.status }
    )
  }

  try {
    const arrayBuffer = await response.arrayBuffer()
    if (!arrayBuffer.byteLength) {
      throw new Error('Remote image body is empty')
    }
    const buffer = Buffer.from(arrayBuffer)
    let transformer = sharp(buffer).webp({ quality: 85 })
    if (width) {
      transformer = transformer.resize({ width, withoutEnlargement: true })
    }
    const output = await transformer.toBuffer()
    const buffer = output.buffer.slice(
      output.byteOffset,
      output.byteOffset + output.byteLength
    )
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Unable to convert image', details: (error as Error).message },
      { status: 500 }
    )
  }
}
