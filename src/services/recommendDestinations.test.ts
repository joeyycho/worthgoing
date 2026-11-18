import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { INITIAL_TRAVEL_SEARCH } from '../constants/travelSearch.js';
import { MOCK_DESTINATIONS } from '../data/mockDestinations.js';
import { recommendDestinations } from './recommendDestinations.js';
import type { TravelSearchFormState } from '../types/travelSearch.js';

const JAPAN_IDS = ['osaka', 'tokyo', 'fukuoka'] as const;

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
      assert.notEqual(hit!.status, undefined);
    }
    assert.ok(MOCK_DESTINATIONS.some((item) => item.id === 'osaka'));
  });

  it('marks price_unknown when confirmed quotes are null (singapore force)', async () => {
    const rows = await recommendDestinations(form, 'recommended');
    const singapore = rows.find((row) => row.destination.id === 'singapore');
    assert.ok(singapore);
    assert.equal(singapore!.flight.totalFareKrw, null);
    assert.equal(singapore!.lodging.totalStayKrw, null);
    assert.equal(singapore!.estimatedTotalKrw, null);
    assert.equal(singapore!.status, 'price_unknown');
    assert.equal(singapore!.isMock, true);
  });
});
