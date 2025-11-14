# Art Game - 4rtW0rk

Minimalist daily art guessing game powered by Next.js and Supabase.
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
