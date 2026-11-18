import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BUDGET_STATUS_LABEL } from '../constants/recommendation.js';
import type { DestinationRecommendation } from '../types/recommendation.js';
import type { AccommodationQuote, FlightQuote } from '../types/providers.js';
import type { TripSnapshot } from '../types/tripStore.js';
import {
  normalizeRecommendationSnapshot,
  normalizeTripSnapshot,
} from './normalizeRecommendationSnapshot.js';

/** Minimal flight quote matching pre-#20 / current shape. */
function mockFlight(totalFareKrw: number | null): FlightQuote {
  return {
    totalFareKrw,
    carrier: 'MOCK AIR',
    summary: '목업 항공',
    bookingUrl: 'https://example.com/mock-flights',
    isMock: true,
    priceMode: 'mock',
    searchedAt: '2026-11-01T00:00:00.000Z',
    roundTrip: true,
    baggageNotes: null,
    stats: { min: totalFareKrw, max: totalFareKrw, avg: totalFareKrw, offerCount: 1, currency: 'KRW' },
    provider: 'mock',
  };
}

function mockStay(totalStayKrw: number | null): AccommodationQuote {
  return {
    totalStayKrw,
    perPersonStayKrw: totalStayKrw,
    propertyName: 'MOCK HOTEL',
    summary: '목업 숙소 · 1박×4',
    bookingUrl: 'https://example.com/mock-stays',
    isMock: true,
    priceMode: 'mock',
    searchedAt: '2026-11-01T00:00:00.000Z',
    nights: 4,
    rooms: 1,
    travelers: 1,
    stats: { min: totalStayKrw, max: totalStayKrw, avg: totalStayKrw, offerCount: 1, currency: 'KRW' },
    provider: 'mock',
  };
}

const OSAKA_DEST = {
  id: 'osaka',
  city: '오사카',
  country: '일본',
  countryCode: 'JP',
  airportCode: 'KIX',
  intro: '먹거리와 쇼핑',
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

/**
 * Realistic pre-#20 recommendation JSON — no searchCost, estimatedTripTotalKrw,
 * localSpendTotalKrw, or localSpendMeta. Matches recommend shape at 2478e0c.
 */
function legacyOsakaRecommendation(
  overrides: Record<string, unknown> = {},
): DestinationRecommendation {
  const flightFare = 270_000;
  const stayTotal = 180_000;
  const localSpend = {
    activityKrw: 125_000,
    foodKrw: 175_000,
    shoppingKrw: 100_000,
  };
  const localTotal = 400_000;
  const estimatedTotalKrw = flightFare + stayTotal + localTotal;

  const base = {
    destination: OSAKA_DEST,
    flight: mockFlight(flightFare),
    lodging: mockStay(stayTotal),
    localSpend,
    breakdown: {
      flightKrw: flightFare,
      lodgingKrw: stayTotal,
      activityKrw: localSpend.activityKrw,
      foodKrw: localSpend.foodKrw,
      shoppingKrw: localSpend.shoppingKrw,
    },
    estimatedTotalKrw,
    totalBudgetKrw: 1_000_000,
    remainingKrw: 1_000_000 - estimatedTotalKrw,
    remainingPercent: 15,
    status: 'within_budget' as const,
    isMock: true,
  };

  // Cast: intentionally omit post-#20 fields to simulate persisted JSON.
  return { ...base, ...overrides } as DestinationRecommendation;
}

/** Field access pattern used by DestinationDetailScreen + CostBreakdownChart. */
function assertDetailReadable(item: DestinationRecommendation): void {
  assert.ok(item.searchCost);
  assert.equal(typeof item.searchCost.flightTotalKrw === 'number' || item.searchCost.flightTotalKrw === null, true);
  assert.equal(typeof item.searchCost.stayTotalKrw === 'number' || item.searchCost.stayTotalKrw === null, true);
  void item.searchCost.searchCostTotalKrw;
  void item.localSpendMeta;
  void item.localSpendTotalKrw;
  const trip = item.estimatedTripTotalKrw ?? item.estimatedTotalKrw;
  void trip;
  const label = BUDGET_STATUS_LABEL[item.status];
  assert.ok(label);
  assert.match(label, /예상|확인|미확정/);
}

describe('normalizeRecommendationSnapshot (legacy pre-#20)', () => {
  it('normalizes without throw and maps estimatedTotal → trip estimate', () => {
    const legacy = legacyOsakaRecommendation();
    assert.equal((legacy as { searchCost?: unknown }).searchCost, undefined);

    const normalized = normalizeRecommendationSnapshot(legacy);
    assertDetailReadable(normalized);

    assert.equal(normalized.estimatedTripTotalKrw, 850_000);
    assert.equal(normalized.estimatedTotalKrw, 850_000);
  });

  it('preserves flight/lodging and sets search total only when both valid', () => {
    const normalized = normalizeRecommendationSnapshot(legacyOsakaRecommendation());
    assert.equal(normalized.searchCost.flightTotalKrw, 270_000);
    assert.equal(normalized.searchCost.stayTotalKrw, 180_000);
    assert.equal(normalized.searchCost.searchCostTotalKrw, 450_000);

    const flightOnly = normalizeRecommendationSnapshot(
      legacyOsakaRecommendation({
        lodging: mockStay(null),
        breakdown: {
          flightKrw: 270_000,
          lodgingKrw: null,
          activityKrw: 125_000,
          foodKrw: 175_000,
          shoppingKrw: 100_000,
        },
        estimatedTotalKrw: null,
        remainingKrw: null,
        remainingPercent: null,
        status: 'price_unknown',
      }),
    );
    assert.equal(flightOnly.searchCost.flightTotalKrw, 270_000);
    assert.equal(flightOnly.searchCost.stayTotalKrw, null);
    assert.equal(flightOnly.searchCost.searchCostTotalKrw, null);
  });

  it('sums legacy localSpend and synthesizes estimate meta; no invented transport', () => {
    const normalized = normalizeRecommendationSnapshot(legacyOsakaRecommendation());
    assert.equal(normalized.localSpendTotalKrw, 400_000);
    assert.deepEqual(normalized.localSpendMeta, {
      source: 'catalog_daily_estimate',
      confidence: 'low',
      isEstimated: true,
    });
    assert.equal(normalized.localSpend?.transportKrw, undefined);
    assert.equal(normalized.breakdown.transportKrw, undefined);
  });

  it('keeps missing local as unknown (no invent from thin air)', () => {
    const normalized = normalizeRecommendationSnapshot(
      legacyOsakaRecommendation({
        localSpend: null,
        breakdown: {
          flightKrw: 270_000,
          lodgingKrw: 180_000,
          activityKrw: null,
          foodKrw: null,
          shoppingKrw: null,
        },
        estimatedTotalKrw: null,
        remainingKrw: null,
        remainingPercent: null,
        status: 'price_unknown',
      }),
    );
    assert.equal(normalized.localSpend, null);
    assert.equal(normalized.localSpendTotalKrw, null);
    assert.equal(normalized.localSpendMeta, null);
  });

  it('keeps legacy statuses readable as estimates, not confirmed booking', () => {
    const within = normalizeRecommendationSnapshot(legacyOsakaRecommendation());
    assert.equal(within.status, 'within_budget');
    assert.equal(BUDGET_STATUS_LABEL[within.status], '예상 예산 적합');

    const over = normalizeRecommendationSnapshot(
      legacyOsakaRecommendation({ status: 'over_budget' }),
    );
    assert.equal(over.status, 'over_budget');
    assert.equal(BUDGET_STATUS_LABEL[over.status], '예상 예산 초과');

    const unknown = normalizeRecommendationSnapshot(
      legacyOsakaRecommendation({
        status: 'price_unknown',
        estimatedTotalKrw: null,
        remainingKrw: null,
        remainingPercent: null,
      }),
    );
    assert.equal(unknown.status, 'price_unknown');
    assert.equal(BUDGET_STATUS_LABEL[unknown.status], '가격 확인 필요');
  });

  it('does not corrupt current (post-#20) snapshots and is idempotent', () => {
    const current: DestinationRecommendation = {
      destination: OSAKA_DEST,
      flight: mockFlight(270_000),
      lodging: mockStay(180_000),
      searchCost: {
        flightTotalKrw: 270_000,
        stayTotalKrw: 180_000,
        searchCostTotalKrw: 450_000,
      },
      localSpend: {
        activityKrw: 125_000,
        foodKrw: 175_000,
        shoppingKrw: 100_000,
      },
      localSpendMeta: {
        source: 'catalog_daily_estimate',
        confidence: 'low',
        isEstimated: true,
      },
      localSpendTotalKrw: 400_000,
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
    };

    const once = normalizeRecommendationSnapshot(current);
    const twice = normalizeRecommendationSnapshot(once);
    assert.deepEqual(once.searchCost, current.searchCost);
    assert.equal(once.estimatedTripTotalKrw, 850_000);
    assert.equal(once.estimatedTotalKrw, 850_000);
    assert.equal(once.localSpendTotalKrw, 400_000);
    assert.equal(once.status, 'within_budget_estimate');
    assert.deepEqual(twice, once);

    // Never overwrite valid new trip total with a different legacy alias
    const mixed = normalizeRecommendationSnapshot({
      ...current,
      estimatedTripTotalKrw: 850_000,
      estimatedTotalKrw: 999_999,
    });
    assert.equal(mixed.estimatedTripTotalKrw, 850_000);
    assert.equal(mixed.estimatedTotalKrw, 999_999);
  });

  it('does not mutate the input object', () => {
    const legacy = legacyOsakaRecommendation();
    const clone = structuredClone(legacy);
    normalizeRecommendationSnapshot(legacy);
    assert.deepEqual(legacy, clone);
    assert.equal((legacy as { searchCost?: unknown }).searchCost, undefined);
  });
});

describe('legacy saved + shared detail open (integration via normalize boundary)', () => {
  it('legacy saved snapshot detail field access does not throw', () => {
    const snapshot: TripSnapshot = {
      version: 1,
      capturedAt: '2026-11-01T12:00:00.000Z',
      form: {
        budgetPerPerson: 500_000,
        travelers: 1,
        originCountry: 'KR',
        tripLengthDays: 5,
        departureAirports: ['ICN'],
        departureDate: '2026-12-01',
        returnDate: '2026-12-05',
      },
      recommendation: legacyOsakaRecommendation(),
      isMock: true,
      storageKind: 'client-local-mock',
    };

    const normalized = normalizeTripSnapshot(snapshot);
    assertDetailReadable(normalized.recommendation);
    assert.equal(normalized.recommendation.estimatedTripTotalKrw, 850_000);
    assert.equal(normalized.recommendation.searchCost.searchCostTotalKrw, 450_000);
  });

  it('legacy shared payload JSON → normalizeTripSnapshot (decode boundary)', () => {
    const snapshot: TripSnapshot = {
      version: 1,
      capturedAt: '2026-11-01T12:00:00.000Z',
      form: {
        budgetPerPerson: 500_000,
        travelers: 1,
        originCountry: 'KR',
        tripLengthDays: 5,
        departureAirports: ['ICN'],
        departureDate: '2026-12-01',
        returnDate: '2026-12-05',
      },
      recommendation: legacyOsakaRecommendation(),
      isMock: true,
      storageKind: 'client-local-mock',
    };

    // Simulate portable share payload: JSON round-trip then normalize (decodeSnapshotPayload).
    const parsed = JSON.parse(JSON.stringify(snapshot)) as TripSnapshot;
    assert.equal((parsed.recommendation as { searchCost?: unknown }).searchCost, undefined);
    const decoded = normalizeTripSnapshot(parsed);
    assertDetailReadable(decoded.recommendation);
    assert.equal(decoded.recommendation.searchCost.flightTotalKrw, 270_000);
    assert.equal(decoded.recommendation.localSpendTotalKrw, 400_000);
    assert.ok(decoded.recommendation.localSpendMeta?.isEstimated);
  });
});
