import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { INITIAL_TRAVEL_SEARCH } from '../constants/travelSearch.js';
import { MOCK_DESTINATIONS } from '../data/mockDestinations.js';
import {
  buildSearchCostTotals,
  estimateLocalSpend,
  recommendDestinations,
  resolveBudgetFitStatus,
  sumLocalSpend,
} from './recommendDestinations.js';
import type { TravelSearchFormState } from '../types/travelSearch.js';

const JAPAN_IDS = ['osaka', 'tokyo', 'fukuoka'] as const;

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
