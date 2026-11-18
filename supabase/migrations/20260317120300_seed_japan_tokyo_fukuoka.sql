-- Forward-only seed: Tokyo (NRT) + Fukuoka (FUK) for FE catalog / persistence FK.
-- Does NOT invent travel_cost_statistics (local spend). Not applied to prod by this PR.
-- Idempotent via ON CONFLICT, matching 20260317120200_seed_airports_destinations.sql style.

insert into public.airports (code, city, name, country_code) values
  ('NRT', '도쿄', '나리타국제공항', 'JP'),
  ('FUK', '후쿠오카', '후쿠오카공항', 'JP')
on conflict (code) do update set
  city = excluded.city,
  name = excluded.name,
  country_code = excluded.country_code;

insert into public.destinations (id, city, country, country_code, airport_code, intro, photo_url, photo_alt) values
  (
    'tokyo',
    '도쿄',
    '일본',
    'JP',
    'NRT',
    '시부야·아사쿠사부터 근교 온천까지, 짧은 일정에도 밀도를 높이기 좋은 도시예요.',
    '/destinations/tokyo.svg',
    '도쿄 목업 대표 이미지'
  ),
  (
    'fukuoka',
    '후쿠오카',
    '일본',
    'JP',
    'FUK',
    '하카타 먹거리와 도심이 가까워 짧은 일본 여행에 부담이 적은 도시예요.',
    '/destinations/fukuoka.svg',
    '후쿠오카 목업 대표 이미지'
  )
on conflict (id) do update set
  city = excluded.city,
  country = excluded.country,
  country_code = excluded.country_code,
  airport_code = excluded.airport_code,
  intro = excluded.intro,
  photo_url = excluded.photo_url,
  photo_alt = excluded.photo_alt,
  updated_at = now();
