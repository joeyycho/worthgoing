import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DestinationRecommendation } from '../types/recommendation.js';
import type { AccommodationQuote, FlightQuote } from '../types/providers.js';
import type { SavedTrip, TripSnapshot } from '../types/tripStore.js';
import { mergeCloudAndLocalSavedTrips } from './mergeSavedTrips.js';
import { normalizeTripSnapshot } from './normalizeRecommendationSnapshot.js';

function mockFlight(overrides: Partial<FlightQuote> = {}): FlightQuote {
  return {
    totalFareKrw: 270_000,
    carrier: 'MOCK AIR',
    summary: '목업 항공',
    bookingUrl: 'https://example.com/mock-flights',
    isMock: true,
    priceMode: 'mock',
    searchedAt: '2026-11-01T00:00:00.000Z',
    roundTrip: true,
    baggageNotes: null,
    stats: { min: 270_000, max: 270_000, avg: 270_000, offerCount: 1, currency: 'KRW' },
    provider: 'mock',
    ...overrides,
  };
}

function mockStay(overrides: Partial<AccommodationQuote> = {}): AccommodationQuote {
  return {
    totalStayKrw: 180_000,
    perPersonStayKrw: 180_000,
    propertyName: 'MOCK HOTEL',
    summary: '목업 숙소',
    bookingUrl: 'https://example.com/mock-stays',
    isMock: true,
    priceMode: 'mock',
    searchedAt: '2026-11-01T00:00:00.000Z',
    nights: 4,
    rooms: 1,
    travelers: 1,
    stats: { min: 180_000, max: 180_000, avg: 180_000, offerCount: 1, currency: 'KRW' },
    provider: 'mock',
    ...overrides,
  };
}

const DEST = {
  id: 'osaka',
  city: '오사카',
  country: '일본',
  countryCode: 'JP',
  airportCode: 'KIX',
  intro: '먹거리',
  photoUrl: '/destinations/osaka.svg',
  photoAlt: '오사카',
  attractions: ['오사카성'],
  food: ['타코야키'],
  activities: ['산책'],
  shopping: ['신사이바시'],
  sampleItinerary: [{ day: 1, title: '도착', detail: '도톤보리' }],
  localDailyPerPerson: { activityKrw: 25_000, foodKrw: 35_000, shoppingKrw: 20_000 },
  priceFactor: 0.95,
};

function recommendation(
  overrides: Partial<DestinationRecommendation> = {},
): DestinationRecommendation {
  return {
    destination: DEST,
    flight: mockFlight(),
    lodging: mockStay(),
    localSpend: { activityKrw: 125_000, foodKrw: 175_000, shoppingKrw: 100_000 },
    localSpendTotalKrw: 400_000,
    localSpendMeta: {
      source: 'catalog_daily_estimate',
      confidence: 'low',
      isEstimated: true,
    },
    searchCost: {
      flightTotalKrw: 270_000,
      stayTotalKrw: 180_000,
      searchCostTotalKrw: 450_000,
    },
    breakdown: {
      flightKrw: 270_000,
      lodgingKrw: 180_000,
      activityKrw: 125_000,
      foodKrw: 175_000,
      shoppingKrw: 100_000,
    },
    estimatedTripTotalKrw: 850_000,
    estimatedTotalKrw: 850_000,
    totalBudgetKrw: 1_000_000,
    remainingKrw: 150_000,
    remainingPercent: 15,
    status: 'within_budget_estimate',
    isMock: true,
    ...overrides,
  };
}

function snapshot(
  storageKind: TripSnapshot['storageKind'],
  recOverrides: Partial<DestinationRecommendation> = {},
): TripSnapshot {
  return {
    version: 1,
    capturedAt: '2026-11-01T00:00:00.000Z',
    form: {
      budgetPerPerson: 500_000,
      travelers: 2,
      originCountry: 'KR',
      departureAirports: ['ICN'],
      tripLengthDays: 5,
      departureDate: '2026-12-01',
      returnDate: '2026-12-05',
    },
    recommendation: recommendation(recOverrides),
    isMock: recOverrides.isMock ?? true,
    storageKind,
  };
}

function trip(
  id: string,
  createdAt: string,
  storageKind: TripSnapshot['storageKind'],
  recOverrides: Partial<DestinationRecommendation> = {},
): SavedTrip {
  return { id, createdAt, snapshot: snapshot(storageKind, recOverrides) };
}

describe('mergeCloudAndLocalSavedTrips', () => {
  it('cloud + empty local → cloud only', () => {
    const cloud = [trip('c1', '2026-11-02T00:00:00.000Z', 'supabase')];
    const merged = mergeCloudAndLocalSavedTrips(cloud, []);
    assert.deepEqual(
      merged.map((t) => t.id),
      ['c1'],
    );
    assert.equal(merged[0]?.snapshot.storageKind, 'supabase');
  });

  it('cloud + extra local → both; local-only included', () => {
    const cloud = [trip('c1', '2026-11-02T00:00:00.000Z', 'supabase')];
    const local = [trip('l1', '2026-11-03T00:00:00.000Z', 'client-local-mock')];
    const merged = mergeCloudAndLocalSavedTrips(cloud, local);
    assert.deepEqual(
      merged.map((t) => t.id),
      ['l1', 'c1'],
    );
    assert.equal(merged.find((t) => t.id === 'l1')?.snapshot.storageKind, 'client-local-mock');
    assert.equal(merged.find((t) => t.id === 'c1')?.snapshot.storageKind, 'supabase');
  });

  it('same id in both → prefer cloud version', () => {
    const cloud = [
      trip('same', '2026-11-02T12:00:00.000Z', 'supabase', {
        flight: mockFlight({ isMock: false, priceMode: 'live', totalFareKrw: 300_000 }),
        lodging: mockStay({ isMock: false, priceMode: 'live' }),
        isMock: false,
      }),
    ];
    const local = [
      trip('same', '2026-11-04T00:00:00.000Z', 'client-local-mock', {
        flight: mockFlight({ isMock: true, priceMode: 'mock', totalFareKrw: 111_000 }),
        isMock: true,
      }),
    ];
    const merged = mergeCloudAndLocalSavedTrips(cloud, local);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.id, 'same');
    assert.equal(merged[0]?.snapshot.storageKind, 'supabase');
    assert.equal(merged[0]?.createdAt, '2026-11-02T12:00:00.000Z');
    assert.equal(merged[0]?.snapshot.recommendation.flight.totalFareKrw, 300_000);
    assert.equal(merged[0]?.snapshot.recommendation.flight.priceMode, 'live');
    assert.equal(merged[0]?.snapshot.isMock, false);
  });

  it('both empty → empty', () => {
    assert.deepEqual(mergeCloudAndLocalSavedTrips([], []), []);
  });

  it('sorts newest createdAt first (existing convention)', () => {
    const cloud = [
      trip('older', '2026-11-01T00:00:00.000Z', 'supabase'),
      trip('mid', '2026-11-02T00:00:00.000Z', 'supabase'),
    ];
    const local = [trip('newest', '2026-11-03T00:00:00.000Z', 'client-local-mock')];
    const merged = mergeCloudAndLocalSavedTrips(cloud, local);
    assert.deepEqual(
      merged.map((t) => t.id),
      ['newest', 'mid', 'older'],
    );
  });

  it('retains mock vs live provenance and storageKind after merge', () => {
    const cloud = [
      trip('live-cloud', '2026-11-02T00:00:00.000Z', 'supabase', {
        flight: mockFlight({ isMock: false, priceMode: 'live' }),
        lodging: mockStay({ isMock: false, priceMode: 'indicative' }),
        isMock: false,
      }),
    ];
    const local = [
      trip('mock-local', '2026-11-01T00:00:00.000Z', 'client-local-mock', {
        flight: mockFlight({ isMock: true, priceMode: 'mock' }),
        lodging: mockStay({ isMock: true, priceMode: 'mock' }),
        isMock: true,
      }),
    ];
    const merged = mergeCloudAndLocalSavedTrips(cloud, local);
    const live = merged.find((t) => t.id === 'live-cloud')!;
    const mock = merged.find((t) => t.id === 'mock-local')!;
    assert.equal(live.snapshot.storageKind, 'supabase');
    assert.equal(live.snapshot.isMock, false);
    assert.equal(live.snapshot.recommendation.flight.priceMode, 'live');
    assert.equal(live.snapshot.recommendation.lodging.priceMode, 'indicative');
    assert.equal(mock.snapshot.storageKind, 'client-local-mock');
    assert.equal(mock.snapshot.isMock, true);
    assert.equal(mock.snapshot.recommendation.flight.priceMode, 'mock');
  });

  it('normalize + merge preserves legacy mock without inventing live provenance', () => {
    const legacyLocal: SavedTrip = {
      id: 'legacy-local',
      createdAt: '2026-10-01T00:00:00.000Z',
      snapshot: {
        version: 1,
        capturedAt: '2026-10-01T00:00:00.000Z',
        form: {
          budgetPerPerson: 500_000,
          travelers: 2,
          originCountry: 'KR',
          departureAirports: ['ICN'],
          tripLengthDays: 5,
          departureDate: '2026-12-01',
          returnDate: '2026-12-05',
        },
        recommendation: recommendation({
          flight: mockFlight({ priceMode: undefined as unknown as FlightQuote['priceMode'] }),
          lodging: mockStay({
            isMock: undefined as unknown as boolean,
            priceMode: undefined as unknown as AccommodationQuote['priceMode'],
          }),
          searchCost: undefined as unknown as DestinationRecommendation['searchCost'],
          localSpendTotalKrw: undefined as unknown as number,
          localSpendMeta: undefined as unknown as DestinationRecommendation['localSpendMeta'],
          estimatedTripTotalKrw: undefined as unknown as number,
          status: 'within_budget',
        }),
        isMock: true,
        storageKind: 'client-local-mock',
      },
    };

    const normalizedLocal = {
      ...legacyLocal,
      snapshot: normalizeTripSnapshot(legacyLocal.snapshot),
    };
    const cloud = [trip('cloud-only', '2026-11-02T00:00:00.000Z', 'supabase')];
    const merged = mergeCloudAndLocalSavedTrips(cloud, [normalizedLocal]);
    const hit = merged.find((t) => t.id === 'legacy-local')!;
    assert.equal(hit.snapshot.storageKind, 'client-local-mock');
    assert.equal(hit.snapshot.isMock, true);
    assert.notEqual(hit.snapshot.recommendation.flight.priceMode, 'live');
    assert.notEqual(hit.snapshot.recommendation.lodging.priceMode, 'live');
    assert.ok(hit.snapshot.recommendation.searchCost);
  });
});
