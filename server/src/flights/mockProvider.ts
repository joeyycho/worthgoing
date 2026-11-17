import type { FlightQuoteResult, FlightSearchRequest } from './types.js';

const BASE_FARE_BY_AIRPORT: Record<string, number> = {
  KIX: 280_000,
  BKK: 320_000,
  DAD: 260_000,
  TPE: 250_000,
  CDG: 980_000,
  CJU: 90_000,
  SIN: 410_000,
};

export function searchMockFlights(query: FlightSearchRequest): FlightQuoteResult {
  const origin = query.originAirports[0] ?? 'ICN';
  const destination = query.destinationAirport;
  const destinationId = query.destinationId ?? destination;
  const searchedAt = new Date().toISOString();
  const flexible = !query.departureDate && !query.returnDate;

  if (destinationId === 'singapore') {
    return {
      totalFareKrw: null,
      currency: 'KRW',
      carrier: 'MOCK AIR',
      summary: '목업 항공 시세 확인 중 — 확정 요금이 아니에요.',
      bookingUrl: `https://example.com/mock-flights?dest=${destination}`,
      isMock: true,
      priceMode: 'mock',
      searchedAt,
      roundTrip: true,
      baggageNotes: null,
      stats: { min: null, max: null, avg: null, offerCount: 0, currency: 'KRW' },
      provider: 'mock',
      destinationId: query.destinationId,
      destinationAirport: destination,
    };
  }

  const base = BASE_FARE_BY_AIRPORT[destination] ?? 350_000;
  const originBias = query.originAirports.includes('ICN') ? 1 : 1.08;
  const lengthBias = 1 + Math.max(0, query.tripLengthDays - 4) * 0.015;
  const perPerson = Math.round((base * originBias * lengthBias) / 10_000) * 10_000;
  const total = perPerson * query.travelers;
  const spread = Math.round(total * 0.12);

  return {
    totalFareKrw: total,
    currency: 'KRW',
    carrier: 'MOCK AIR',
    summary: flexible
      ? `${origin} → ${destination} 왕복 · ${query.travelers}명 · MOCK 유연 일정 예상가`
      : `${origin} → ${destination} 왕복 · ${query.travelers}명 · MOCK 시세`,
    bookingUrl: `https://example.com/mock-flights?dest=${destination}&pax=${query.travelers}`,
    isMock: true,
    priceMode: 'mock',
    searchedAt,
    roundTrip: true,
    baggageNotes: 'MOCK · 수하물 정보는 예시입니다.',
    stats: {
      min: total,
      max: total + spread,
      avg: total + Math.round(spread / 2),
      offerCount: 3,
      currency: 'KRW',
    },
    provider: 'mock',
    destinationId: query.destinationId,
    destinationAirport: destination,
  };
}
