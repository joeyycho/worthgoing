import type {
  AccommodationProvider,
  AccommodationQuote,
  AccommodationQuoteQuery,
} from '../types/providers';

const NIGHTLY_BASE_BY_CITY: Record<string, number> = {
  오사카: 95_000,
  방콕: 70_000,
  다낭: 60_000,
  타이베이: 85_000,
  파리: 180_000,
  제주: 75_000,
  싱가포르: 150_000,
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultRooms(travelers: number) {
  return Math.max(1, Math.ceil(travelers / 2));
}

export class MockAccommodationProvider implements AccommodationProvider {
  private readonly priceFactorByDestination: Record<string, number>;
  private readonly forceUnknownIds: Set<string>;

  constructor(options: {
    priceFactorByDestination: Record<string, number>;
    forceUnknownIds: Set<string>;
  }) {
    this.priceFactorByDestination = options.priceFactorByDestination;
    this.forceUnknownIds = options.forceUnknownIds;
  }

  async searchAccommodations(query: AccommodationQuoteQuery): Promise<AccommodationQuote> {
    await delay(160);

    const destinationId = query.destinationId ?? query.city;
    const nights = Math.max(1, query.nights);
    const rooms = query.rooms ?? defaultRooms(query.travelers);
    const searchedAt = new Date().toISOString();
    const flexible = !query.checkInDate && !query.checkOutDate;

    if (this.forceUnknownIds.has(destinationId)) {
      return {
        totalStayKrw: null,
        perPersonStayKrw: null,
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
      };
    }

    const nightly = NIGHTLY_BASE_BY_CITY[query.city] ?? 100_000;
    const factor = this.priceFactorByDestination[destinationId] ?? 1;
    const roomFactor = query.travelers > 2 ? 1.35 : 1;
    const total = Math.round((nightly * nights * factor * roomFactor) / 10_000) * 10_000;
    const spread = Math.round(total * 0.15);
    const perPerson = Math.round(total / Math.max(1, query.travelers));

    return {
      totalStayKrw: total,
      perPersonStayKrw: perPerson,
      propertyName: `MOCK ${query.city} Hotel`,
      summary: flexible
        ? `${nights}박 · ${query.travelers}명 · ${rooms}실 (MOCK 유연 일정)`
        : `${nights}박 · ${query.travelers}명 · ${rooms}실 (MOCK)`,
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
    };
  }
}
