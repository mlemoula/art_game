import fetch from 'node-fetch'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseAnonKey)

const fetchWikiLines = async (name) => {
  const search = await fetch(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name)}&format=json`
  ).then((res) => res.json())

  const firstMatch = search?.query?.search?.[0]
  if (!firstMatch) return 0

  const extractRes = await fetch(
    `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&format=json&titles=${encodeURIComponent(firstMatch.title)}`
  ).then((res) => res.json())

  const pages = extractRes?.query?.pages || {}
  const firstPage = Object.values(pages)[0]
  const text = firstPage?.extract || ''
  return text.split(/\r?\n/).filter((line) => line.trim()).length
}

const updatePopularityScores = async () => {
  const { data: artists, error } = await supabase
    .from('artists')
    .select('id, name, popularity_score')

  if (error) throw error

  for (const artist of artists) {
    if (artist.popularity_score && artist.popularity_score > 1) {
      continue
    }
    const score = await fetchWikiLines(artist.name)
    console.log(`Score for ${artist.name}: ${score}`)
    await supabase
      .from('artists')
      .update({ popularity_score: score })
      .eq('id', artist.id)
  }
}

updatePopularityScores()
  .then(() => console.log('Done'))
  .catch((err) => console.error(err))
