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

## Plays table
Create once in Supabase SQL editor:
```sql
create table public.plays (
  id bigint generated always as identity primary key,
  daily_id bigint references daily_art(id) on delete cascade,
  attempts int not null,
  success boolean not null,
  user_token text,
  created_at timestamptz default now()
);
```
`page.tsx` already writes to this table; later you can build stats dashboards off it.

## Next ideas
- Add an admin view listing upcoming artworks.
- Surface player stats (win rate, streak) in UI.
- Reintroduce sharing once ready (data already available).
