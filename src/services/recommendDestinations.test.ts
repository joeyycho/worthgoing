import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { INITIAL_TRAVEL_SEARCH } from '../constants/travelSearch.js';
import { MOCK_DESTINATIONS } from '../data/mockDestinations.js';
import {
  buildSearchCostTotals,
  estimateLocalSpend,
  recommendDestinations,
  resolveBudgetFitStatus,
  sortRecommendations,
  sumLocalSpend,
} from './recommendDestinations.js';
import type { DestinationRecommendation } from '../types/recommendation.js';
import type { TravelSearchFormState } from '../types/travelSearch.js';

const JAPAN_IDS = ['osaka', 'tokyo', 'fukuoka'] as const;

/** Minimal row for sort-only tests (quote bodies unused by comparator). */
function sortRow(input: {
  id: string;
  city: string;
  estimatedTripTotalKrw: number | null;
  searchCostTotalKrw: number | null;
  status?: DestinationRecommendation['status'];
  remainingPercent?: number | null;
}): DestinationRecommendation {
  return {
    destination: {
      id: input.id,
      city: input.city,
      country: '테스트',
      countryCode: 'XX',
      airportCode: 'XXX',
      intro: '',
      photoUrl: '/',
      photoAlt: '',
      attractions: [],
      food: [],
      activities: [],
      shopping: [],
      sampleItinerary: [],
      priceFactor: 1,
    },
    flight: {
      totalFareKrw: null,
      carrier: '',
      summary: '',
      bookingUrl: '',
      isMock: true,
      priceMode: 'mock',
      searchedAt: '',
      roundTrip: true,
      baggageNotes: null,
      stats: { min: null, max: null, avg: null, offerCount: 0, currency: 'KRW' },
      provider: 'mock',
    },
    lodging: {
      totalStayKrw: null,
      perPersonStayKrw: null,
      propertyName: '',
      summary: '',
      bookingUrl: '',
      isMock: true,
      priceMode: 'mock',
      searchedAt: '',
      nights: 1,
      rooms: 1,
      travelers: 1,
      stats: { min: null, max: null, avg: null, offerCount: 0, currency: 'KRW' },
      provider: 'mock',
    },
    searchCost: {
      flightTotalKrw: input.searchCostTotalKrw == null ? null : input.searchCostTotalKrw,
      stayTotalKrw: input.searchCostTotalKrw == null ? null : 0,
      searchCostTotalKrw: input.searchCostTotalKrw,
    },
    localSpend: null,
    localSpendMeta: null,
    localSpendTotalKrw: null,
    breakdown: {
      flightKrw: null,
      lodgingKrw: null,
      activityKrw: null,
      foodKrw: null,
      shoppingKrw: null,
    },
    estimatedTripTotalKrw: input.estimatedTripTotalKrw,
    estimatedTotalKrw: input.estimatedTripTotalKrw,
    totalBudgetKrw: 1_000_000,
    remainingKrw: null,
    remainingPercent: input.remainingPercent ?? null,
    status: input.status ?? 'price_unknown',
    isMock: true,
  };
}

describe('cost calc helpers', () => {
  it('estimateLocalSpend = daily × tripLengthDays × travelers (not nights)', () => {
    const local = estimateLocalSpend(
      { activityKrw: 25_000, foodKrw: 35_000, shoppingKrw: 20_000 },
      1,
      5,
    );
    assert.equal(local.activityKrw, 125_000);
    assert.equal(local.foodKrw, 175_000);
    assert.equal(local.shoppingKrw, 100_000);
    assert.equal(local.transportKrw, undefined);
    assert.equal(sumLocalSpend(local), 400_000);
  });

  it('searchCostTotal only when both flight and stay present', () => {
    assert.deepEqual(buildSearchCostTotals(100, 50), {
      flightTotalKrw: 100,
      stayTotalKrw: 50,
      searchCostTotalKrw: 150,
    });
    assert.equal(buildSearchCostTotals(100, null).searchCostTotalKrw, null);
    assert.equal(buildSearchCostTotals(null, 50).searchCostTotalKrw, null);
    assert.equal(buildSearchCostTotals(null, null).searchCostTotalKrw, null);
  });

  it('budget status: price_unknown / local_spend_unknown / estimate within|over', () => {
    assert.equal(
      resolveBudgetFitStatus({
        searchCostTotalKrw: null,
        localSpendTotalKrw: 400_000,
        estimatedTripTotalKrw: null,
        totalBudgetKrw: 1_000_000,
      }),
      'price_unknown',
    );
    assert.equal(
      resolveBudgetFitStatus({
        searchCostTotalKrw: 383_059,
        localSpendTotalKrw: null,
        estimatedTripTotalKrw: null,
        totalBudgetKrw: 1_000_000,
      }),
      'local_spend_unknown',
    );
    assert.equal(
      resolveBudgetFitStatus({
        searchCostTotalKrw: 383_059,
        localSpendTotalKrw: 400_000,
        estimatedTripTotalKrw: 783_059,
        totalBudgetKrw: 1_000_000,
      }),
      'within_budget_estimate',
    );
    assert.equal(
      resolveBudgetFitStatus({
        searchCostTotalKrw: 383_059,
        localSpendTotalKrw: 400_000,
        estimatedTripTotalKrw: 783_059,
        totalBudgetKrw: 500_000,
      }),
      'over_budget_estimate',
    );
  });
});

describe('recommendDestinations Japan coverage (mock, no live API)', () => {
  const form: TravelSearchFormState = {
    ...INITIAL_TRAVEL_SEARCH,
    budgetPerPerson: 1_000_000,
    travelers: 1,
    tripLengthDays: 5,
    departureAirports: ['ICN'],
  };

  it('returns Osaka, Tokyo, and Fukuoka in the recommend list', async () => {
    const rows = await recommendDestinations(form, 'lowest_cost');
    const japan = rows.filter((row) =>
      JAPAN_IDS.includes(row.destination.id as (typeof JAPAN_IDS)[number]),
    );
    assert.equal(japan.length, 3);
    for (const id of JAPAN_IDS) {
      const hit = japan.find((row) => row.destination.id === id);
      assert.ok(hit, `recommend missing ${id}`);
      assert.equal(hit!.isMock, true);
      assert.ok(hit!.destination.sampleItinerary.length > 0);
      assert.ok(hit!.localSpend != null);
      assert.ok(hit!.localSpendMeta?.isEstimated);
      assert.equal(hit!.localSpendMeta?.source, 'catalog_daily_estimate');
      assert.ok(hit!.searchCost.searchCostTotalKrw != null);
      assert.ok(hit!.estimatedTripTotalKrw != null);
      assert.equal(hit!.estimatedTotalKrw, hit!.estimatedTripTotalKrw);
      assert.ok(
        hit!.status === 'within_budget_estimate' || hit!.status === 'over_budget_estimate',
      );
      assert.equal(hit!.breakdown.transportKrw, undefined);
    }
    assert.ok(MOCK_DESTINATIONS.some((item) => item.id === 'osaka'));
  });

  it('Osaka local for 5일·1명 = 400_000 and trip total = search + local', async () => {
    const rows = await recommendDestinations(form, 'lowest_cost');
    const osaka = rows.find((row) => row.destination.id === 'osaka');
    assert.ok(osaka);
    assert.equal(osaka!.localSpendTotalKrw, 400_000);
    assert.equal(
      osaka!.estimatedTripTotalKrw,
      (osaka!.searchCost.searchCostTotalKrw as number) + 400_000,
    );
    assert.equal(osaka!.lodging.nights, 4);
  });

  it('marks price_unknown when confirmed quotes are null (singapore force)', async () => {
    const rows = await recommendDestinations(form, 'recommended');
    const singapore = rows.find((row) => row.destination.id === 'singapore');
    assert.ok(singapore);
    assert.equal(singapore!.flight.totalFareKrw, null);
    assert.equal(singapore!.lodging.totalStayKrw, null);
    assert.equal(singapore!.searchCost.searchCostTotalKrw, null);
    assert.equal(singapore!.estimatedTripTotalKrw, null);
    assert.equal(singapore!.estimatedTotalKrw, null);
    assert.equal(singapore!.status, 'price_unknown');
    assert.equal(singapore!.isMock, true);
  });

  it('sorts recommended: within estimate before price_unknown before over', async () => {
    const rows = await recommendDestinations(
      { ...form, budgetPerPerson: 200_000 },
      'recommended',
    );
    const ranks = rows.map((row) => row.status);
    const firstUnknown = ranks.indexOf('price_unknown');
    const firstOver = ranks.findIndex(
      (status) => status === 'over_budget_estimate' || status === 'over_budget',
    );
    if (firstUnknown >= 0 && firstOver >= 0) {
      assert.ok(firstUnknown < firstOver);
    }
  });
});

describe('tiered lowest_cost sort', () => {
  /**
   * Audit A–D:
   * A trip 800k search 500k | B search-only 600k | C trip 800k search 700k | D none
   * Expected: A → C → B → D (tiers not mixed)
   */
  it('orders A→C→B→D (trip tier before search-only; equal trip by search)', () => {
    const A = sortRow({
      id: 'a',
      city: 'A도시',
      estimatedTripTotalKrw: 800_000,
      searchCostTotalKrw: 500_000,
    });
    const B = sortRow({
      id: 'b',
      city: 'B도시',
      estimatedTripTotalKrw: null,
      searchCostTotalKrw: 600_000,
    });
    const C = sortRow({
      id: 'c',
      city: 'C도시',
      estimatedTripTotalKrw: 800_000,
      searchCostTotalKrw: 700_000,
    });
    const D = sortRow({
      id: 'd',
      city: 'D도시',
      estimatedTripTotalKrw: null,
      searchCostTotalKrw: null,
    });

    // Shuffle input so order is not insertion-dependent
    const sorted = sortRecommendations([B, D, C, A], 'lowest_cost');
    assert.deepEqual(
      sorted.map((row) => row.destination.id),
      ['a', 'c', 'b', 'd'],
    );
  });

  it('equal trip uses search secondary; equal search uses name; nulls last in tier', () => {
    const left = sortRow({
      id: 'left',
      city: '가나',
      estimatedTripTotalKrw: 800_000,
      searchCostTotalKrw: 500_000,
    });
    const right = sortRow({
      id: 'right',
      city: '다라',
      estimatedTripTotalKrw: 800_000,
      searchCostTotalKrw: 500_000,
    });
    const equalTrip = sortRecommendations([right, left], 'lowest_cost');
    assert.deepEqual(
      equalTrip.map((row) => row.destination.id),
      ['left', 'right'],
    );

    const s1 = sortRow({
      id: 's1',
      city: '서울',
      estimatedTripTotalKrw: null,
      searchCostTotalKrw: 100_000,
    });
    const s2 = sortRow({
      id: 's2',
      city: '부산',
      estimatedTripTotalKrw: null,
      searchCostTotalKrw: 100_000,
    });
    const equalSearch = sortRecommendations([s1, s2], 'lowest_cost');
    assert.deepEqual(
      equalSearch.map((row) => row.destination.city),
      ['부산', '서울'],
    );

    const withSearch = sortRow({
      id: 'has',
      city: '있음',
      estimatedTripTotalKrw: 500_000,
      searchCostTotalKrw: 200_000,
    });
    const tripNullSearch = sortRow({
      id: 'trip-only-search-null',
      city: '검색없음',
      estimatedTripTotalKrw: 500_000,
      searchCostTotalKrw: null,
    });
    const nullSearchLast = sortRecommendations([tripNullSearch, withSearch], 'lowest_cost');
    assert.deepEqual(
      nullSearchLast.map((row) => row.destination.id),
      ['has', 'trip-only-search-null'],
    );
  });

  it('does not mutate input array or rows', () => {
    const rows = [
      sortRow({
        id: 'z',
        city: 'Z',
        estimatedTripTotalKrw: null,
        searchCostTotalKrw: null,
      }),
      sortRow({
        id: 'a',
        city: 'A',
        estimatedTripTotalKrw: 100,
        searchCostTotalKrw: 50,
      }),
    ];
    const before = rows.map((row) => row.destination.id);
    const sorted = sortRecommendations(rows, 'lowest_cost');
    assert.deepEqual(
      rows.map((row) => row.destination.id),
      before,
    );
    assert.notEqual(sorted, rows);
    assert.deepEqual(
      sorted.map((row) => row.destination.id),
      ['a', 'z'],
    );
  });

  it('recommended mode still prioritizes status before tiered cost', () => {
    const withinExpensive = sortRow({
      id: 'within-hi',
      city: '비쌈',
      estimatedTripTotalKrw: 900_000,
      searchCostTotalKrw: 500_000,
      status: 'within_budget_estimate',
      remainingPercent: 10,
    });
    const overCheap = sortRow({
      id: 'over-lo',
      city: '쌈',
      estimatedTripTotalKrw: 100_000,
      searchCostTotalKrw: 50_000,
      status: 'over_budget_estimate',
      remainingPercent: -50,
    });
    const sorted = sortRecommendations([overCheap, withinExpensive], 'recommended');
    assert.equal(sorted[0]?.destination.id, 'within-hi');
    assert.equal(sorted[1]?.destination.id, 'over-lo');
  });
});

