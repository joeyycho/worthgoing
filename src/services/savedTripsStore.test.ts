import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import type { DestinationRecommendation } from '../types/recommendation.js';
import type { AccommodationQuote, FlightQuote } from '../types/providers.js';
import type { SavedTrip, TripSnapshot } from '../types/tripStore.js';

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
  id: 'tokyo',
  city: '도쿄',
  country: '일본',
  countryCode: 'JP',
  airportCode: 'NRT',
  intro: '도쿄',
  photoUrl: '/destinations/tokyo.svg',
  photoAlt: '도쿄',
  attractions: ['시부야'],
  food: ['라멘'],
  activities: ['산책'],
  shopping: ['신주쿠'],
  sampleItinerary: [{ day: 1, title: '도착', detail: '시부야' }],
  localDailyPerPerson: { activityKrw: 30_000, foodKrw: 40_000, shoppingKrw: 25_000 },
  priceFactor: 1,
};

function recommendation(
  overrides: Partial<DestinationRecommendation> = {},
): DestinationRecommendation {
  return {
    destination: DEST,
    flight: mockFlight(),
    lodging: mockStay(),
    localSpend: { activityKrw: 150_000, foodKrw: 200_000, shoppingKrw: 125_000 },
    localSpendTotalKrw: 475_000,
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
      activityKrw: 150_000,
      foodKrw: 200_000,
      shoppingKrw: 125_000,
    },
    estimatedTripTotalKrw: 925_000,
    estimatedTotalKrw: 925_000,
    totalBudgetKrw: 1_200_000,
    remainingKrw: 275_000,
    remainingPercent: 22,
    status: 'within_budget_estimate',
    isMock: true,
    ...overrides,
  };
}

function makeSnapshot(storageKind: TripSnapshot['storageKind'] = 'client-local-mock'): TripSnapshot {
  return {
    version: 1,
    capturedAt: '2026-11-10T00:00:00.000Z',
    form: {
      budgetPerPerson: 600_000,
      travelers: 2,
      originCountry: 'KR',
      departureAirports: ['ICN'],
      tripLengthDays: 5,
      departureDate: '2026-12-10',
      returnDate: '2026-12-14',
    },
    recommendation: recommendation(),
    isMock: true,
    storageKind,
  };
}

function makeTrip(
  id: string,
  createdAt: string,
  storageKind: TripSnapshot['storageKind'],
): SavedTrip {
  return { id, createdAt, snapshot: makeSnapshot(storageKind) };
}

type ApiMocks = {
  isApiConfigured: () => boolean;
  apiHealth: () => Promise<{ ok: boolean; supabaseConfigured: boolean } | null>;
  apiListSavedTrips: () => Promise<SavedTrip[]>;
  apiSaveTrip: (snapshot: TripSnapshot) => Promise<SavedTrip>;
  apiRemoveSavedTrip: (id: string) => Promise<void>;
};

type LocalMocks = {
  localListSavedTrips: () => Promise<SavedTrip[]>;
  localGetSavedTrip: (id: string) => Promise<SavedTrip | null>;
  localSaveTrip: (snapshot: TripSnapshot) => Promise<SavedTrip>;
  localRemoveSavedTrip: (id: string) => Promise<void>;
};

async function loadStore(api: ApiMocks, local: LocalMocks) {
  mock.reset();
  mock.module('./api/tripApiClient.js', {
    exports: {
      isApiConfigured: api.isApiConfigured,
      apiHealth: api.apiHealth,
      apiListSavedTrips: api.apiListSavedTrips,
      apiSaveTrip: api.apiSaveTrip,
      apiRemoveSavedTrip: api.apiRemoveSavedTrip,
      apiCreateSharedTrip: async () => {
        throw new Error('unused');
      },
      apiGetSharedTrip: async () => null,
    },
  });
  mock.module('./localSavedTripsStore.js', {
    exports: {
      localListSavedTrips: local.localListSavedTrips,
      localGetSavedTrip: local.localGetSavedTrip,
      localSaveTrip: local.localSaveTrip,
      localRemoveSavedTrip: local.localRemoveSavedTrip,
    },
  });
  return import(`./savedTripsStore.js?storetest=${Date.now()}-${Math.random()}`);
}

afterEach(() => {
  mock.reset();
});

describe('savedTripsStore list/save/delete consistency', () => {
  it('cloud list fail → keep local fallback', async () => {
    const localTrip = makeTrip('local-1', '2026-11-11T00:00:00.000Z', 'client-local-mock');
    const store = await loadStore(
      {
        isApiConfigured: () => true,
        apiHealth: async () => ({ ok: true, supabaseConfigured: true }),
        apiListSavedTrips: async () => {
          throw new Error('cloud list down');
        },
        apiSaveTrip: async () => {
          throw new Error('unused');
        },
        apiRemoveSavedTrip: async () => undefined,
      },
      {
        localListSavedTrips: async () => [localTrip],
        localGetSavedTrip: async () => localTrip,
        localSaveTrip: async () => localTrip,
        localRemoveSavedTrip: async () => undefined,
      },
    );

    const listed = await store.listSavedTrips();
    assert.deepEqual(
      listed.map((t: SavedTrip) => t.id),
      ['local-1'],
    );
  });

  it('local list fail during cloud merge → still return cloud', async () => {
    const cloudTrip = makeTrip('cloud-1', '2026-11-11T00:00:00.000Z', 'supabase');
    const store = await loadStore(
      {
        isApiConfigured: () => true,
        apiHealth: async () => ({ ok: true, supabaseConfigured: true }),
        apiListSavedTrips: async () => [cloudTrip],
        apiSaveTrip: async () => cloudTrip,
        apiRemoveSavedTrip: async () => undefined,
      },
      {
        localListSavedTrips: async () => {
          throw new Error('local kv broken');
        },
        localGetSavedTrip: async () => null,
        localSaveTrip: async () => {
          throw new Error('unused');
        },
        localRemoveSavedTrip: async () => undefined,
      },
    );

    const listed = await store.listSavedTrips();
    assert.deepEqual(
      listed.map((t: SavedTrip) => t.id),
      ['cloud-1'],
    );
  });

  it('after local_after_cloud_fail, list immediately includes the local row', async () => {
    const savedLocal = makeTrip('device-row', '2026-11-12T00:00:00.000Z', 'client-local-mock');
    let localRows: SavedTrip[] = [];
    const cloudRows: SavedTrip[] = [
      makeTrip('already-cloud', '2026-11-10T00:00:00.000Z', 'supabase'),
    ];

    const store = await loadStore(
      {
        isApiConfigured: () => true,
        apiHealth: async () => ({ ok: true, supabaseConfigured: true }),
        apiListSavedTrips: async () => cloudRows,
        apiSaveTrip: async () => {
          throw new Error('FK / cloud write failed');
        },
        apiRemoveSavedTrip: async () => undefined,
      },
      {
        localListSavedTrips: async () => localRows,
        localGetSavedTrip: async (id) => localRows.find((t) => t.id === id) ?? null,
        localSaveTrip: async (snapshot) => {
          const next = {
            ...savedLocal,
            snapshot: { ...snapshot, storageKind: 'client-local-mock' as const },
          };
          localRows = [next, ...localRows.filter((t) => t.id !== next.id)];
          return next;
        },
        localRemoveSavedTrip: async (id) => {
          localRows = localRows.filter((t) => t.id !== id);
        },
      },
    );

    const result = await store.saveTrip(makeSnapshot('supabase'));
    assert.equal(result.persistence, 'local_after_cloud_fail');
    assert.equal(result.trip.id, 'device-row');

    const listed = await store.listSavedTrips();
    assert.ok(listed.some((t: SavedTrip) => t.id === 'device-row'));
    assert.ok(listed.some((t: SavedTrip) => t.id === 'already-cloud'));
    assert.equal(listed.find((t: SavedTrip) => t.id === 'device-row')?.snapshot.storageKind, 'client-local-mock');
  });

  it('delete removes from both stores so merge cannot resurrect', async () => {
    let cloudRows = [
      makeTrip('shared-id', '2026-11-12T00:00:00.000Z', 'supabase'),
      makeTrip('cloud-only', '2026-11-11T00:00:00.000Z', 'supabase'),
    ];
    let localRows = [
      makeTrip('shared-id', '2026-11-13T00:00:00.000Z', 'client-local-mock'),
      makeTrip('local-only', '2026-11-10T00:00:00.000Z', 'client-local-mock'),
    ];
    const removedCloud: string[] = [];
    const removedLocal: string[] = [];

    const store = await loadStore(
      {
        isApiConfigured: () => true,
        apiHealth: async () => ({ ok: true, supabaseConfigured: true }),
        apiListSavedTrips: async () => cloudRows,
        apiSaveTrip: async () => {
          throw new Error('unused');
        },
        apiRemoveSavedTrip: async (id) => {
          removedCloud.push(id);
          cloudRows = cloudRows.filter((t) => t.id !== id);
        },
      },
      {
        localListSavedTrips: async () => localRows,
        localGetSavedTrip: async (id) => localRows.find((t) => t.id === id) ?? null,
        localSaveTrip: async () => {
          throw new Error('unused');
        },
        localRemoveSavedTrip: async (id) => {
          removedLocal.push(id);
          localRows = localRows.filter((t) => t.id !== id);
        },
      },
    );

    await store.removeSavedTrip('shared-id');
    assert.deepEqual(removedCloud, ['shared-id']);
    assert.deepEqual(removedLocal, ['shared-id']);

    const listed = await store.listSavedTrips();
    assert.deepEqual(
      listed.map((t: SavedTrip) => t.id).sort(),
      ['cloud-only', 'local-only'],
    );
    assert.ok(!listed.some((t: SavedTrip) => t.id === 'shared-id'));
  });

  it('delete of local-only while cloud healthy still clears local', async () => {
    let localRows = [makeTrip('only-local', '2026-11-12T00:00:00.000Z', 'client-local-mock')];
    const removedLocal: string[] = [];

    const store = await loadStore(
      {
        isApiConfigured: () => true,
        apiHealth: async () => ({ ok: true, supabaseConfigured: true }),
        apiListSavedTrips: async () => [],
        apiSaveTrip: async () => {
          throw new Error('unused');
        },
        apiRemoveSavedTrip: async () => undefined,
      },
      {
        localListSavedTrips: async () => localRows,
        localGetSavedTrip: async (id) => localRows.find((t) => t.id === id) ?? null,
        localSaveTrip: async () => {
          throw new Error('unused');
        },
        localRemoveSavedTrip: async (id) => {
          removedLocal.push(id);
          localRows = localRows.filter((t) => t.id !== id);
        },
      },
    );

    await store.removeSavedTrip('only-local');
    assert.deepEqual(removedLocal, ['only-local']);
    const listed = await store.listSavedTrips();
    assert.deepEqual(listed, []);
  });
});
