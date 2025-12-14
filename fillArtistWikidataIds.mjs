import { createClient } from '@supabase/supabase-js'
import { searchWikidataId } from './lib/artistWikiHelper.js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const BATCH_LIMIT = 100

const fillMissingWikidataIds = async () => {
  let offset = 0
  while (true) {
    const { data: artists, error } = await supabase
      .from('artists')
      .select('id,name,wikidata_id')
      .order('id', { ascending: true })
      .range(offset, offset + BATCH_LIMIT - 1)

    if (error) {
      throw error
    }

    if (!artists || artists.length === 0) {
      console.log('✅ Reached end of artist list')
      break
    }

    const missingArtists = artists.filter(
      (artist) => !artist.wikidata_id || !artist.wikidata_id.trim()
    )

    if (!missingArtists.length) {
      offset += artists.length
      continue
    }

    for (const artist of missingArtists) {
      await delay(250)
      const wikidataId = await searchWikidataId(artist.name)
      if (!wikidataId) {
        console.warn(`⚠️  Could not resolve Wikidata ID for ${artist.name}`)
        continue
      }
      const { error: updateError } = await supabase
        .from('artists')
        .update({ wikidata_id: wikidataId })
        .eq('id', artist.id)
      if (updateError) {
        throw updateError
      }
      console.log(`✔️  ${artist.name} -> ${wikidataId}`)
    }

    offset += artists.length
  }
}

fillMissingWikidataIds()
  .then(() => console.log('Done populating wikidata_id column'))
  .catch((err) => {
    console.error('Failed to populate wikidata_id column', err)
    process.exit(1)
  })
