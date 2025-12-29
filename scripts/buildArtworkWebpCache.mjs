import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import fetch from 'node-fetch'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'

const CACHE_JSON = path.resolve('src/data/generatedArtImages.json')
const ARTWORK_CACHE_BUCKET = process.env.ARTWORK_CACHE_BUCKET || 'generated-artworks'
const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set before generating the artwork cache.'
  )
}

const supabaseClient = createClient(supabaseUrl, supabaseServiceKey)

const loadCache = async () => {
  try {
    const raw = await fs.readFile(CACHE_JSON, 'utf8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

const saveCache = async (cache) => {
  await fs.mkdir(path.dirname(CACHE_JSON), { recursive: true })
  await fs.writeFile(CACHE_JSON, JSON.stringify(cache, null, 2), 'utf8')
}

const safeFetchImage = async (url) => {
  const response = await fetch(url, {
    headers: {
      accept: 'image/*',
      'user-agent': '4rtW0rk Image Converter (https://github.com/4rtw0rk)',
    },
  })
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  if (!buffer.byteLength) {
    throw new Error(`Empty response for ${url}`)
  }
  return buffer
}

const fetchPendingArtworks = async () => {
  const { data, error } = await supabaseClient
    .from('daily_art')
    .select('id, date, image_url')
    .is('cached_image_url', null)
    .not('image_url', 'is', null)
    .order('date', { ascending: true })

  if (error) {
    throw error
  }

  return data || []
}

const uploadToStorage = async (hash, buffer) => {
  const storagePath = `${hash}.webp`
  const { error: uploadError } = await supabaseClient.storage
    .from(ARTWORK_CACHE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: 'image/webp',
      upsert: true,
    })

  if (uploadError) {
    throw uploadError
  }

  const { data } = supabaseClient.storage
    .from(ARTWORK_CACHE_BUCKET)
    .getPublicUrl(storagePath)

  return data?.publicUrl || `${supabaseUrl}/storage/v1/object/public/${ARTWORK_CACHE_BUCKET}/${storagePath}`
}

const build = async () => {
  const records = await fetchPendingArtworks()
  const cache = await loadCache()

  for (const record of records) {
    const imageUrl = record.image_url
    if (!imageUrl) continue
    const hash = crypto.createHash('sha1').update(imageUrl).digest('hex').slice(0, 12)

    try {
      console.log(`Converting ${imageUrl}`)
      const sourceBuffer = await safeFetchImage(imageUrl)
      let converted
      try {
        converted = await sharp(sourceBuffer).webp({ quality: 85 }).toBuffer()
      } catch (sharpError) {
        if (
          /exceeds pixel limit/i.test(
            sharpError?.message || ''
          )
        ) {
          converted = await sharp(sourceBuffer)
            .resize({ width: 4000, height: 4000, fit: 'inside' })
            .webp({ quality: 85 })
            .toBuffer()
        } else {
          throw sharpError
        }
      }
      const publicUrl = await uploadToStorage(hash, converted)
      cache[imageUrl] = publicUrl

      if (supabaseClient && record.id) {
        const updatedAt = new Date().toISOString()
        const { error } = await supabaseClient
          .from('daily_art')
          .update({
            cached_image_url: publicUrl,
            cached_image_generated_at: updatedAt,
          })
          .eq('id', record.id)
        if (error) {
          console.warn(
            `Unable to update Supabase for ${record.date} (${imageUrl}):`,
            error.message
          )
        }
      }
    } catch (error) {
      console.warn(`Skipping ${imageUrl}:`, error)
    }
  }

  await saveCache(cache)
  console.log(`Generated ${Object.keys(cache).length} cached artworks`)
}

build().catch((error) => {
  console.error('Failed to build artwork cache', error)
  process.exitCode = 1
})
