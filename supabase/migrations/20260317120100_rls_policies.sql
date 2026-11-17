-- 갈만해 stage 5: RLS policies (minimal PII, per-user saved trips, token-based shared reads)

alter table public.users enable row level security;
alter table public.airports enable row level security;
alter table public.destinations enable row level security;
alter table public.flight_searches enable row level security;
alter table public.flight_offers enable row level security;
alter table public.accommodation_searches enable row level security;
alter table public.accommodation_offers enable row level security;
alter table public.travel_cost_statistics enable row level security;
alter table public.destination_activities enable row level security;
alter table public.saved_trips enable row level security;
alter table public.shared_trips enable row level security;

-- Public catalog reads (no PII)
create policy airports_public_read on public.airports
  for select to anon, authenticated
  using (true);

create policy destinations_public_read on public.destinations
  for select to anon, authenticated
  using (is_active = true);

create policy destination_activities_public_read on public.destination_activities
  for select to anon, authenticated
  using (true);

create policy travel_cost_statistics_public_read on public.travel_cost_statistics
  for select to anon, authenticated
  using (true);

-- users: only self (auth.uid) can read/update own row; inserts via service role / trigger typically
create policy users_select_own on public.users
  for select to authenticated
  using (auth_user_id = auth.uid());

create policy users_update_own on public.users
  for update to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- Helper: map auth.uid() -> public.users.id
create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.users where auth_user_id = auth.uid() limit 1;
$$;

revoke all on function public.current_app_user_id() from public;
grant execute on function public.current_app_user_id() to authenticated;

-- saved_trips: per-user only
create policy saved_trips_select_own on public.saved_trips
  for select to authenticated
  using (user_id = public.current_app_user_id());

create policy saved_trips_insert_own on public.saved_trips
  for insert to authenticated
  with check (user_id = public.current_app_user_id());

create policy saved_trips_update_own on public.saved_trips
  for update to authenticated
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

create policy saved_trips_delete_own on public.saved_trips
  for delete to authenticated
  using (user_id = public.current_app_user_id());

-- shared_trips: readable by anyone who knows share_token (or id); writers must be owner when authenticated
create policy shared_trips_select_by_token on public.shared_trips
  for select to anon, authenticated
  using (
    expires_at is null
    or expires_at > now()
  );

create policy shared_trips_insert_own on public.shared_trips
  for insert to authenticated
  with check (
    created_by is null
    or created_by = public.current_app_user_id()
  );

create policy shared_trips_delete_own on public.shared_trips
  for delete to authenticated
  using (created_by = public.current_app_user_id());

-- Search / offer rows: owner-only when linked to a user; otherwise no client access (service role only)
create policy flight_searches_select_own on public.flight_searches
  for select to authenticated
  using (user_id = public.current_app_user_id());

create policy flight_searches_insert_own on public.flight_searches
  for insert to authenticated
  with check (user_id = public.current_app_user_id());

create policy flight_offers_select_own on public.flight_offers
  for select to authenticated
  using (
    exists (
      select 1 from public.flight_searches s
      where s.id = search_id and s.user_id = public.current_app_user_id()
    )
  );

create policy accommodation_searches_select_own on public.accommodation_searches
  for select to authenticated
  using (user_id = public.current_app_user_id());

create policy accommodation_searches_insert_own on public.accommodation_searches
  for insert to authenticated
  with check (user_id = public.current_app_user_id());

create policy accommodation_offers_select_own on public.accommodation_offers
  for select to authenticated
  using (
    exists (
      select 1 from public.accommodation_searches s
      where s.id = search_id and s.user_id = public.current_app_user_id()
    )
  );

-- Note: service_role bypasses RLS. The stage-5 API server uses the service role key
-- and must never expose that key to the Vite frontend.
