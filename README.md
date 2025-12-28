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

## Caching generated artwork images

After you generate a new `artworks_generated.csv` (or whenever Supabase has new rows), run the cache helper so the UI can load a lightweight WebP from your own origin:

1. In Supabase add the cache columns (once):

```sql
ALTER TABLE public.daily_art
  ADD COLUMN IF NOT EXISTS cached_image_url TEXT,
  ADD COLUMN IF NOT EXISTS cached_image_generated_at TIMESTAMPTZ;
```

2. Install the dependencies if you haven’t already and run the generator with your service role key. The script now queries Supabase for any rows where `cached_image_url` is `NULL`, so it only reprocesses the missing artwork entries:

```
npm install
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
npm run generate:image-cache
```

That downloads every `image_url`, converts it to `/public/generated-artworks/<hash>.webp`, updates `daily_art.cached_image_url`, and enriches `src/data/generatedArtImages.json`. The frontend prefers `cached_image_url` and falls back to the JSON map if needed.

3. Repeat step 2 whenever you refresh the CSV so the cache (and Supabase column) stays in sync—nothing else is required on the UI side.

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
