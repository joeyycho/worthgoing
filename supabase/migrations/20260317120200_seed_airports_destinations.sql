-- Optional seed: departure + destination airports and sample destinations

insert into public.airports (code, city, name, country_code) values
  ('ICN', '인천', '인천국제공항', 'KR'),
  ('GMP', '김포', '김포국제공항', 'KR'),
  ('PUS', '부산', '김해국제공항', 'KR'),
  ('CJU', '제주', '제주국제공항', 'KR'),
  ('TAE', '대구', '대구국제공항', 'KR'),
  ('KWJ', '광주', '광주공항', 'KR'),
  ('KIX', '오사카', '간사이국제공항', 'JP'),
  ('BKK', '방콕', '수완나품국제공항', 'TH'),
  ('DAD', '다낭', '다낭국제공항', 'VN'),
  ('TPE', '타이베이', '타오위안국제공항', 'TW'),
  ('CDG', '파리', '샤를 드 골 공항', 'FR'),
  ('SIN', '싱가포르', '창이국제공항', 'SG')
on conflict (code) do update set
  city = excluded.city,
  name = excluded.name,
  country_code = excluded.country_code;

insert into public.destinations (id, city, country, country_code, airport_code, intro, photo_url, photo_alt) values
  ('osaka', '오사카', '일본', 'JP', 'KIX', '먹거리와 쇼핑이 가까운 도시예요.', '/destinations/osaka.svg', '오사카 목업 대표 이미지'),
  ('bangkok', '방콕', '태국', 'TH', 'BKK', '따뜻한 날씨와 합리적인 현지 물가의 도시예요.', '/destinations/bangkok.svg', '방콕 목업 대표 이미지'),
  ('danang', '다낭', '베트남', 'VN', 'DAD', '해변과 호이안이 가까운 여유로운 도시예요.', '/destinations/danang.svg', '다낭 목업 대표 이미지'),
  ('taipei', '타이베이', '대만', 'TW', 'TPE', '야시장과 카페가 매력인 도시예요.', '/destinations/taipei.svg', '타이베이 목업 대표 이미지'),
  ('paris', '파리', '프랑스', 'FR', 'CDG', '박물관과 산책 코스가 많은 도시예요.', '/destinations/paris.svg', '파리 목업 대표 이미지'),
  ('jeju', '제주', '대한민국', 'KR', 'CJU', '국내선으로 부담을 낮출 수 있는 선택이에요.', '/destinations/jeju.svg', '제주 목업 대표 이미지'),
  ('singapore', '싱가포르', '싱가포르', 'SG', 'SIN', '짧은 일정에 도시 관광을 담기 좋아요.', '/destinations/singapore.svg', '싱가포르 목업 대표 이미지')
on conflict (id) do update set
  city = excluded.city,
  country = excluded.country,
  country_code = excluded.country_code,
  airport_code = excluded.airport_code,
  intro = excluded.intro,
  photo_url = excluded.photo_url,
  photo_alt = excluded.photo_alt,
  updated_at = now();

insert into public.travel_cost_statistics (destination_id, category, amount_krw_per_person_per_day, source_label, notes) values
  ('osaka', 'activity', 25000, 'mock_estimate', '예상 경비 예시 — 실제 여행자 통계가 아닙니다.'),
  ('osaka', 'food', 35000, 'mock_estimate', '예상 경비 예시 — 실제 여행자 통계가 아닙니다.'),
  ('osaka', 'shopping', 20000, 'mock_estimate', '예상 경비 예시 — 실제 여행자 통계가 아닙니다.'),
  ('bangkok', 'activity', 20000, 'mock_estimate', '예상 경비 예시 — 실제 여행자 통계가 아닙니다.'),
  ('bangkok', 'food', 25000, 'mock_estimate', '예상 경비 예시 — 실제 여행자 통계가 아닙니다.'),
  ('bangkok', 'shopping', 18000, 'mock_estimate', '예상 경비 예시 — 실제 여행자 통계가 아닙니다.'),
  ('danang', 'activity', 18000, 'mock_estimate', '예상 경비 예시 — 실제 여행자 통계가 아닙니다.'),
  ('danang', 'food', 22000, 'mock_estimate', '예상 경비 예시 — 실제 여행자 통계가 아닙니다.'),
  ('danang', 'shopping', 15000, 'mock_estimate', '예상 경비 예시 — 실제 여행자 통계가 아닙니다.'),
  ('taipei', 'activity', 22000, 'mock_estimate', '예상 경비 예시 — 실제 여행자 통계가 아닙니다.'),
  ('taipei', 'food', 30000, 'mock_estimate', '예상 경비 예시 — 실제 여행자 통계가 아닙니다.'),
  ('taipei', 'shopping', 22000, 'mock_estimate', '예상 경비 예시 — 실제 여행자 통계가 아닙니다.'),
  ('paris', 'activity', 45000, 'mock_estimate', '예상 경비 예시 — 실제 여행자 통계가 아닙니다.'),
  ('paris', 'food', 55000, 'mock_estimate', '예상 경비 예시 — 실제 여행자 통계가 아닙니다.'),
  ('paris', 'shopping', 40000, 'mock_estimate', '예상 경비 예시 — 실제 여행자 통계가 아닙니다.'),
  ('jeju', 'activity', 20000, 'mock_estimate', '예상 경비 예시 — 실제 여행자 통계가 아닙니다.'),
  ('jeju', 'food', 30000, 'mock_estimate', '예상 경비 예시 — 실제 여행자 통계가 아닙니다.'),
  ('jeju', 'shopping', 15000, 'mock_estimate', '예상 경비 예시 — 실제 여행자 통계가 아닙니다.'),
  ('singapore', 'activity', 35000, 'mock_estimate', '예상 경비 예시 — 실제 여행자 통계가 아닙니다.'),
  ('singapore', 'food', 40000, 'mock_estimate', '예상 경비 예시 — 실제 여행자 통계가 아닙니다.'),
  ('singapore', 'shopping', 30000, 'mock_estimate', '예상 경비 예시 — 실제 여행자 통계가 아닙니다.')
on conflict (destination_id, category, as_of, source_label) do nothing;

insert into public.destination_activities (destination_id, kind, title, detail, sort_order) values
  ('osaka', 'attraction', '오사카성', '', 1),
  ('osaka', 'attraction', '도톤보리', '', 2),
  ('osaka', 'food', '타코야키', '', 1),
  ('osaka', 'activity', '유니버설 스튜디오 재팬', '', 1),
  ('osaka', 'shopping', '신사이바시', '', 1),
  ('bangkok', 'attraction', '왕궁', '', 1),
  ('bangkok', 'food', '팟타이', '', 1),
  ('danang', 'attraction', '미케 비치', '', 1),
  ('taipei', 'attraction', '타이베이 101', '', 1),
  ('paris', 'attraction', '에펠탑', '', 1),
  ('jeju', 'attraction', '성산일출봉', '', 1),
  ('singapore', 'attraction', '마리나베이 샌즈', '', 1);
