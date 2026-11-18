import type { FlightProvider, FlightQuote, FlightQuoteQuery } from '../types/providers';

const BASE_FARE_BY_AIRPORT: Record<string, number> = {
  KIX: 280_000,
  BKK: 320_000,
  DAD: 260_000,
  TPE: 250_000,
  CDG: 980_000,
  CJU: 90_000,
  SIN: 410_000,
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockFlightProvider implements FlightProvider {
  private readonly priceFactorByDestination: Record<string, number>;
  private readonly forceUnknownIds: Set<string>;

  constructor(options: {
    priceFactorByDestination: Record<string, number>;
    forceUnknownIds: Set<string>;
  }) {
    this.priceFactorByDestination = options.priceFactorByDestination;
    this.forceUnknownIds = options.forceUnknownIds;
  }

  async searchFlights(query: FlightQuoteQuery): Promise<FlightQuote> {
    await delay(180);

    const destinationId = query.destinationId ?? query.destinationAirport;
    const bookingUrl = `https://example.com/mock-flights?dest=${encodeURIComponent(query.destinationAirport)}&pax=${query.travelers}`;
    const searchedAt = new Date().toISOString();
    const flexible = !query.departureDate && !query.returnDate;

    if (this.forceUnknownIds.has(destinationId)) {
      return {
        totalFareKrw: null,
        carrier: 'MOCK AIR',
        summary: '목업 항공 시세 확인 중 — 확정 요금이 아니에요.',
        bookingUrl,
        isMock: true,
        priceMode: 'mock',
        searchedAt,
        roundTrip: true,
        baggageNotes: null,
        stats: { min: null, max: null, avg: null, offerCount: 0, currency: 'KRW' },
        provider: 'mock',
      };
    }

    const base = BASE_FARE_BY_AIRPORT[query.destinationAirport] ?? 350_000;
    const factor = this.priceFactorByDestination[destinationId] ?? 1;
    const originBias = query.originAirports.includes('ICN') ? 1 : 1.08;
    const lengthBias = 1 + Math.max(0, query.tripLengthDays - 4) * 0.015;
    const perPerson = Math.round((base * factor * originBias * lengthBias) / 10_000) * 10_000;
    const total = perPerson * query.travelers;
    const spread = Math.round(total * 0.12);

    return {
      totalFareKrw: total,
      carrier: 'MOCK AIR',
      summary: flexible
        ? `${query.originAirports.join('/')} → ${query.destinationAirport} 왕복 · ${query.travelers}명 (MOCK 유연 일정)`
        : `${query.originAirports.join('/')} → ${query.destinationAirport} 왕복 · ${query.travelers}명 (MOCK)`,
      bookingUrl,
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
    };
  }
}
