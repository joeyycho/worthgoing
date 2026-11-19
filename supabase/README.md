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
psql "$DATABASE_URL" -f supabase/migrations/20260317120300_seed_japan_tokyo_fukuoka.sql
```

## Japan destinations (Tokyo / Fukuoka)

Migration `20260317120300_seed_japan_tokyo_fukuoka.sql` adds FE-aligned rows only (no fake local-spend stats):

| Table | Expected |
| --- | --- |
| `airports` | `NRT` (도쿄 / 나리타국제공항), `FUK` (후쿠오카 / 후쿠오카공항) |
| `destinations` | `tokyo` → `NRT`, `fukuoka` → `FUK` (Osaka/`KIX` unchanged from prior seed) |

Operator verification (after apply — this repo does not apply to prod):

```sql
select code, city, name, country_code
from public.airports
where code in ('KIX', 'NRT', 'FUK')
order by code;

select id, city, airport_code, country_code
from public.destinations
where id in ('osaka', 'tokyo', 'fukuoka')
order by id;
```

## Server

Secrets stay in `server/` only (`SUPABASE_SERVICE_ROLE_KEY`). The Vite app talks to `VITE_API_BASE_URL` and never receives the service role key.

```bash
cd server
cp .env.example .env   # fill Dev project values locally — do not commit
npm install
npm run dev            # sets NODE_ENV=development; loads server/.env via process.loadEnvFile
```

Local loading gate (`server/src/env.ts`):

| `NODE_ENV` | `server/.env` |
| --- | --- |
| `development` | load if present |
| `production` | never load |
| unset / other | never load |

`npm run dev` sets `NODE_ENV=development`. Plain `npm start` does not — set `NODE_ENV=development` yourself if you want file load, or inject env via the host. Existing process env values always win over the file. Production/deploy should inject `SUPABASE_*` via the host (no committed `.env`).

Without env configured, the server responds `503` on `/api/*` and the mini-app falls back to client Storage.
