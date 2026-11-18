import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FLIGHT_FARE_PRESENT_DISCLAIMER,
  FLIGHT_FARE_UNAVAILABLE,
  flightFareAmountLabel,
} from './flightFareDisplay.js';

describe('flightFareAmountLabel', () => {
  it('null → 확인불가 (never fake amount)', () => {
    assert.equal(flightFareAmountLabel(null), FLIGHT_FARE_UNAVAILABLE);
    assert.equal(flightFareAmountLabel(null), '확인불가');
  });

  it('present amount → formatted KRW', () => {
    assert.equal(flightFareAmountLabel(450_000), '450,000원');
    assert.match(FLIGHT_FARE_PRESENT_DISCLAIMER, /예상 왕복 항공료/);
    assert.match(FLIGHT_FARE_PRESENT_DISCLAIMER, /검색 당시 표시 가격/);
    assert.match(FLIGHT_FARE_PRESENT_DISCLAIMER, /세금/);
  });
});
