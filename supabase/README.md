# Supabase (갈만해 stage 5)

## Apply migrations

### Option A — Supabase CLI

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

### Option B — psql

```bash
psql "$DATABASE_URL" -f supabase/migrations/20260317120000_init_schema.sql
psql "$DATABASE_URL" -f supabase/migrations/20260317120100_rls_policies.sql
psql "$DATABASE_URL" -f supabase/migrations/20260317120200_seed_airports_destinations.sql
```

## Server

Secrets stay in `server/` only (`SUPABASE_SERVICE_ROLE_KEY`). The Vite app talks to `VITE_API_BASE_URL` and never receives the service role key.

```bash
cd server
cp .env.example .env   # fill real values locally — do not commit
npm install
npm run dev
```

Without env configured, the server responds `503` on `/api/*` and the mini-app falls back to client Storage.
