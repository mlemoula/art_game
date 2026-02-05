import fs from 'fs/promises'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

const CACHE_JSON = path.resolve('src/data/generatedArtImages.json')
const ARTWORK_CACHE_BUCKET = process.env.ARTWORK_CACHE_BUCKET || 'generated-artworks'
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set before running this script.')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

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

const parseStoragePath = (url) => {
  if (!url) return null
  const match = url.match(new RegExp(`/storage/v1/object/public/${ARTWORK_CACHE_BUCKET}/(.+)$`))
  if (match && match[1]) {
    return decodeURIComponent(match[1])
  }
  return null
}

const cleanup = async () => {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - 31)
  const cutoffString = cutoffDate.toISOString().split('T')[0]

  const cache = await loadCache()
  let cacheChanged = false

  const { data, error } = await supabase
    .from('daily_art')
    .select('id, date, image_url, cached_image_url')
    .lte('date', cutoffString)
    .not('cached_image_url', 'is', null)
    .order('date', { ascending: true })

  if (error) {
    throw error
  }

  const records = data ?? []
  if (!records.length) {
    console.log('No cached artworks older than 31 days were found.')
    return
  }

  let deletedFiles = 0

  for (const record of records) {
    const storagePath = parseStoragePath(record.cached_image_url ?? '')
    if (storagePath) {
      const { error: deleteError } = await supabase.storage
        .from(ARTWORK_CACHE_BUCKET)
        .remove([storagePath])
      if (deleteError) {
        console.warn(
          `Unable to delete cached file for ${record.date} (${record.id}):`,
          deleteError.message
        )
      } else {
        deletedFiles += 1
      }
    } else {
      console.warn(
        `Unable to derive storage path for ${record.date} (${record.id}); skipping bucket delete.`
      )
    }

    const deletionTimestamp = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('daily_art')
      .update({
        cached_image_url: null,
        cached_image_generated_at: deletionTimestamp,
      })
      .eq('id', record.id)

    if (updateError) {
      console.warn(
        `Unable to reset cache metadata for ${record.date} (${record.id}):`,
        updateError.message
      )
    }

    if (record.image_url && cache[record.image_url]) {
      delete cache[record.image_url]
      cacheChanged = true
    }
  }

  if (cacheChanged) {
    await saveCache(cache)
  }

  console.log(`Candidate rows processed: ${records.length}`)
  console.log(`Deleted cached files: ${deletedFiles}`)
}

cleanup().catch((error) => {
  console.error('Failed to clean up cached artworks:', error)
  process.exitCode = 1
})
