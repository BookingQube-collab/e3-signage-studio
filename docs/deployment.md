# Deployment

Production admin + device API, database, media storage, and rollback. Hosted CMS: `https://e3-cms.vercel.app`.

## Environment

Copy `.env.example` to `.env` locally. Never commit real passwords or keys.

| Variable | Where | Purpose |
|---|---|---|
| `VITE_API_MODE` | Browser | `http` in production (not `mock`) |
| `VITE_SUPABASE_URL` / `SUPABASE_URL` | Browser + server | Project URL. Vercel also accepts `NEXT_PUBLIC_SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` / `SUPABASE_ANON_KEY` | Browser + server | Publishable key. Aliases: `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY` |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Service role. Alias: `SUPABASE_SECRET_KEY`. Never prefix with `VITE_` |
| `DATABASE_URL` | Migrations | Direct Postgres (`sslmode=require`) |
| `DATABASE_POOLER_URL` | Migrations | IPv4 session pooler when the direct host is IPv6-only |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT` | Server | Cloudflare R2. If any are empty, media uses a private Supabase Storage bucket named `media` |

Device APKs never contain Supabase or R2 credentials. TVs call the CMS origin only.

## Database migrations

SQL lives in `supabase/migrations/` (phase-numbered files, applied in filename order). Apply to the hosted project the same way later phases were applied: `psql` against `DATABASE_POOLER_URL` (or `DATABASE_URL`) with the project’s session pooler. Do not print the connection string.

Media library folders: `20260826190000_media_folders.sql` adds `media_folders` and nullable `media.folder_id`. Unfiled files keep `folder_id` null. This is additive and does not change playlist or package JSON.

## Storage setup

1. Prefer Cloudflare R2: private bucket, no public listing, signed PUT (admin upload) and GET (device download).
2. Fallback: Supabase Storage bucket `media`, private, same signed-URL flow.
3. Object keys are append-only (`org / media / version / checksum`). Replacing a file creates a new version; old keys stay until unused.

## Build (admin)

```
npm i
npm run build
```

Local preview: `npm run dev` (inlines `VITE_*`). Production on Vercel reads Supabase aliases at **runtime** — do not rely on them being present at the Vite build.

## Deploy (admin)

- **App + device REST:** Vercel (this repo’s Nitro/TanStack Start output). Production URL: `https://e3-cms.vercel.app`.
- **Postgres / Auth / Realtime:** the linked Supabase project.
- **Media:** R2 or Supabase Storage as above.
- Set `VITE_API_MODE=http` and the Supabase URL/anon/service keys on the Vercel project. After each `origin/main` push, wait for the Vercel deployment before pairing new TVs.

## Rollback

- **Admin/API:** revert the git commit on `main` with a new commit (never force-push; Lovable syncs this branch). Vercel will redeploy.
- **Database:** keep the previous migration reversible; do not drop columns that old app versions still read.
- **Player:** keep the previous known-good APK. The TV retains the previous READY package and will not activate a failed download.
