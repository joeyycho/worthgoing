-- 갈만해 stage 5: core schema
-- Apply with: supabase db push  OR  psql "$DATABASE_URL" -f ...

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- users (minimal PII; Toss/external key until full auth linkage)
-- ---------------------------------------------------------------------------
create table public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  external_key text unique,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_identity_chk check (auth_user_id is not null or external_key is not null)
);

create index users_external_key_idx on public.users (external_key);

-- ---------------------------------------------------------------------------
-- airports
-- ---------------------------------------------------------------------------
create table public.airports (
  code text primary key,
  city text not null,
  name text not null,
  country_code text not null default 'KR',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- destinations
-- ---------------------------------------------------------------------------
create table public.destinations (
  id text primary key,
  city text not null,
  country text not null,
  country_code text not null,
  airport_code text not null references public.airports (code),
  intro text not null default '',
  photo_url text not null default '',
  photo_alt text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index destinations_airport_code_idx on public.destinations (airport_code);
create index destinations_country_code_idx on public.destinations (country_code);

-- ---------------------------------------------------------------------------
-- flight_searches / flight_offers
-- ---------------------------------------------------------------------------
create table public.flight_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete set null,
  origin_airports text[] not null,
  destination_airport text not null references public.airports (code),
  travelers integer not null check (travelers between 1 and 10),
  trip_length_days integer not null check (trip_length_days between 1 and 30),
  departure_date date,
  return_date date,
  provider text not null default 'mock',
  created_at timestamptz not null default now()
);

create index flight_searches_user_id_idx on public.flight_searches (user_id);
create index flight_searches_created_at_idx on public.flight_searches (created_at desc);

create table public.flight_offers (
  id uuid primary key default gen_random_uuid(),
  search_id uuid not null references public.flight_searches (id) on delete cascade,
  carrier text not null,
  total_fare_krw integer,
  summary text not null default '',
  booking_url text not null default '',
  is_mock boolean not null default true,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index flight_offers_search_id_idx on public.flight_offers (search_id);

-- ---------------------------------------------------------------------------
-- accommodation_searches / accommodation_offers
-- ---------------------------------------------------------------------------
create table public.accommodation_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete set null,
  city text not null,
  country text not null,
  destination_id text references public.destinations (id) on delete set null,
  travelers integer not null check (travelers between 1 and 10),
  nights integer not null check (nights >= 1),
  check_in_date date,
  check_out_date date,
  provider text not null default 'mock',
  created_at timestamptz not null default now()
);

create index accommodation_searches_user_id_idx on public.accommodation_searches (user_id);
create index accommodation_searches_destination_id_idx on public.accommodation_searches (destination_id);

create table public.accommodation_offers (
  id uuid primary key default gen_random_uuid(),
  search_id uuid not null references public.accommodation_searches (id) on delete cascade,
  property_name text not null,
  total_stay_krw integer,
  summary text not null default '',
  booking_url text not null default '',
  is_mock boolean not null default true,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index accommodation_offers_search_id_idx on public.accommodation_offers (search_id);

-- ---------------------------------------------------------------------------
-- travel_cost_statistics (example / curated estimates — not live traveler stats)
-- ---------------------------------------------------------------------------
create table public.travel_cost_statistics (
  id uuid primary key default gen_random_uuid(),
  destination_id text not null references public.destinations (id) on delete cascade,
  category text not null check (category in ('activity', 'food', 'shopping', 'lodging', 'flight')),
  amount_krw_per_person_per_day integer not null check (amount_krw_per_person_per_day >= 0),
  currency text not null default 'KRW',
  as_of date not null default current_date,
  source_label text not null default 'mock_estimate',
  notes text not null default '예상 경비 예시 — 실제 여행자 통계가 아닙니다.',
  created_at timestamptz not null default now(),
  unique (destination_id, category, as_of, source_label)
);

create index travel_cost_statistics_destination_id_idx on public.travel_cost_statistics (destination_id);

-- ---------------------------------------------------------------------------
-- destination_activities
-- ---------------------------------------------------------------------------
create table public.destination_activities (
  id uuid primary key default gen_random_uuid(),
  destination_id text not null references public.destinations (id) on delete cascade,
  kind text not null check (kind in ('attraction', 'food', 'activity', 'shopping', 'itinerary')),
  title text not null,
  detail text not null default '',
  day_number integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index destination_activities_destination_id_idx on public.destination_activities (destination_id);
create index destination_activities_kind_idx on public.destination_activities (kind);

-- ---------------------------------------------------------------------------
-- saved_trips / shared_trips
-- ---------------------------------------------------------------------------
create table public.saved_trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  destination_id text references public.destinations (id) on delete set null,
  snapshot jsonb not null,
  captured_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index saved_trips_user_id_idx on public.saved_trips (user_id);
create index saved_trips_destination_id_idx on public.saved_trips (destination_id);
create index saved_trips_captured_at_idx on public.saved_trips (captured_at desc);

create table public.shared_trips (
  id uuid primary key default gen_random_uuid(),
  share_token text not null unique,
  created_by uuid references public.users (id) on delete set null,
  destination_id text references public.destinations (id) on delete set null,
  snapshot jsonb not null,
  captured_at timestamptz not null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index shared_trips_share_token_idx on public.shared_trips (share_token);
create index shared_trips_created_by_idx on public.shared_trips (created_by);
create index shared_trips_expires_at_idx on public.shared_trips (expires_at);

-- updated_at helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_set_updated_at
before update on public.users
for each row execute function public.set_updated_at();

create trigger destinations_set_updated_at
before update on public.destinations
for each row execute function public.set_updated_at();

create trigger saved_trips_set_updated_at
before update on public.saved_trips
for each row execute function public.set_updated_at();
