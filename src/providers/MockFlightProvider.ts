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

    if (this.forceUnknownIds.has(destinationId)) {
      return {
        totalFareKrw: null,
        carrier: 'MOCK AIR',
        summary: '목업 항공 시세 확인 중 — 확정 요금이 아니에요.',
        bookingUrl,
        isMock: true,
      };
    }

    const base = BASE_FARE_BY_AIRPORT[query.destinationAirport] ?? 350_000;
    const factor = this.priceFactorByDestination[destinationId] ?? 1;
    const originBias = query.originAirports.includes('ICN') ? 1 : 1.08;
    const lengthBias = 1 + Math.max(0, query.tripLengthDays - 4) * 0.015;
    const perPerson = Math.round((base * factor * originBias * lengthBias) / 10_000) * 10_000;

    return {
      totalFareKrw: perPerson * query.travelers,
      carrier: 'MOCK AIR',
      summary: `${query.originAirports.join('/')} → ${query.destinationAirport} 왕복 · ${query.travelers}명 (MOCK)`,
      bookingUrl,
      isMock: true,
    };
  }
}
