# Art Game - 4rtW0rk

Minimalist daily one minute art guessing game powered by Next.js and Supabase.
👉 https://4rtw0rk.vercel.app/

## Deploy
1. Install deps: `npm install`.
2. Build locally: `npm run build`.
3. Deploy via Vercel/Netlify. Set env vars:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_ENABLE_SUPABASE_ARTISTS=true`

## Data refresh workflow
1. Export existing artworks (`SELECT image_url FROM daily_art`).
2. Run `node generate_daily_art.js` (script skips rows missing image/year/museum and artists absent from `artists_rows.csv`).
3. Import the new `artworks_generated.csv` into Supabase, scheduling dates for the next 100+ days.

## Next ideas
- Add an admin view listing upcoming artworks.
- Surface player stats (win rate, streak) in UI.
- Reintroduce sharing once ready (data already available).
### Cleaning least popular artists

```sql
-- Preview the 50 artists that would be deleted
SELECT id, name, popularity_score
FROM public.artists
ORDER BY popularity_score ASC NULLS FIRST, id ASC
LIMIT 50;

-- Delete them once you're ready
DELETE FROM public.artists
WHERE id IN (
  SELECT id
  FROM public.artists
  ORDER BY popularity_score ASC NULLS FIRST, id ASC
  LIMIT 50
);

-- Delete a batch only when their popularity score is very low
DELETE FROM public.artists
WHERE id IN (
  SELECT id
  FROM public.artists
  WHERE COALESCE(popularity_score, 0) < 25
  ORDER BY popularity_score ASC NULLS FIRST, id ASC
  LIMIT 50
);

-- Or just preview them without deleting
SELECT id, name, popularity_score
FROM public.artists
WHERE COALESCE(popularity_score, 0) < 25
ORDER BY popularity_score ASC NULLS FIRST, id ASC
LIMIT 50;
```

### Updating `popularity_score` automatically

1. Add artists manually in Supabase (`public.artists`). Leave `popularity_score` NULL.
2. Run the helper script to pull Wikipedia summaries and assign scores based on line counts.

Create `scripts/updatePopularityScore.mjs`:

```js
import fetch from 'node-fetch'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const fetchWikiLines = async (name) => {
  const searchRes = await fetch(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name)}&format=json`
  ).then((r) => r.json())
  const first = searchRes?.query?.search?.[0]
  if (!first) return 0
  const summary = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(first.title)}`
  ).then((r) => r.json())
  const text = summary?.extract || ''
  return text.split(/\r?\n/).filter(Boolean).length
}

const run = async () => {
  const { data: artists, error } = await supabase
    .from('artists')
    .select('id, name')
  if (error) throw error

  for (const artist of artists) {
    const score = await fetchWikiLines(artist.name)
    console.log(`Score ${score} for ${artist.name}`)
    await supabase
      .from('artists')
      .update({ popularity_score: score })
      .eq('id', artist.id)
  }
}

run().then(() => console.log('Done')).catch(console.error)
```

Then run locally:

```bash
SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
node scripts/updatePopularityScore.mjs
```
