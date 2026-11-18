import { adultsPerRoom, defaultRoomCount, resolveHotelCityCode } from './cityCodes.js';
import type { AccommodationQuoteResult, AccommodationSearchRequest } from './types.js';

const NIGHTLY_BASE_BY_CITY: Record<string, number> = {
  오사카: 95_000,
  도쿄: 120_000,
  후쿠오카: 100_000,
  방콕: 70_000,
  다낭: 60_000,
  타이베이: 85_000,
  파리: 180_000,
  제주: 75_000,
  싱가포르: 150_000,
};

export function searchMockAccommodations(
  query: AccommodationSearchRequest,
): AccommodationQuoteResult {
  const searchedAt = new Date().toISOString();
  const nights = Math.max(1, query.nights);
  const rooms = query.rooms ?? defaultRoomCount(query.travelers);
  const cityCode = resolveHotelCityCode(query);
  const destinationId = query.destinationId ?? query.city;
  const flexible = !query.checkInDate && !query.checkOutDate;

  if (destinationId === 'singapore') {
    return {
      totalStayKrw: null,
      perPersonStayKrw: null,
      currency: 'KRW',
      propertyName: 'MOCK Stay',
      summary: '목업 숙소 요금 확인 중 — 확정 가격이 아니에요.',
      bookingUrl: '',
      isMock: true,
      priceMode: 'mock',
      searchedAt,
      nights,
      rooms,
      travelers: query.travelers,
      stats: { min: null, max: null, avg: null, offerCount: 0, currency: 'KRW' },
      provider: 'mock',
      destinationId: query.destinationId,
      city: query.city,
      country: query.country,
      cityCode,
    };
  }

  const nightly = NIGHTLY_BASE_BY_CITY[query.city] ?? 100_000;
  const roomFactor = adultsPerRoom(query.travelers, rooms) > 2 ? 1.2 : 1;
  const total = Math.round((nightly * nights * roomFactor * rooms) / 10_000) * 10_000;
  const spread = Math.round(total * 0.15);
  const perPerson = Math.round(total / Math.max(1, query.travelers));

  return {
    totalStayKrw: total,
    perPersonStayKrw: perPerson,
    currency: 'KRW',
    propertyName: `MOCK ${query.city} Hotel`,
    summary: flexible
      ? `${nights}박 · ${query.travelers}명 · ${rooms}실 · MOCK 유연 일정 예상가`
      : `${nights}박 · ${query.travelers}명 · ${rooms}실 · MOCK 시세`,
    bookingUrl: '',
    isMock: true,
    priceMode: 'mock',
    searchedAt,
    nights,
    rooms,
    travelers: query.travelers,
    stats: {
      min: total,
      max: total + spread,
      avg: total + Math.round(spread / 2),
      offerCount: 3,
      currency: 'KRW',
    },
    provider: 'mock',
    destinationId: query.destinationId,
    city: query.city,
    country: query.country,
    cityCode,
  };
}
