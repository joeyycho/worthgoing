import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DestinationRecommendation } from '../types/recommendation.js';
import type { AccommodationQuote, FlightQuote } from '../types/providers.js';
import { normalizeRecommendationSnapshot } from '../services/normalizeRecommendationSnapshot.js';
import {
  classifyQuoteProvenance,
  classifySharedTripProvenance,
  formatSavedTripProvenanceSummary,
  formatShareMessageHeadline,
  formatSharedTripProvenancePhrase,
} from './priceProvenance.js';

function liveFlight(overrides: Partial<FlightQuote> = {}): FlightQuote {
  return {
    totalFareKrw: 300_000,
    carrier: 'KE',
    summary: 'live flight',
    bookingUrl: 'https://example.com/f',
    isMock: false,
    priceMode: 'live',
    searchedAt: '2026-11-18T00:00:00.000Z',
    roundTrip: true,
    baggageNotes: null,
    stats: { min: 300_000, max: 300_000, avg: 300_000, offerCount: 1, currency: 'KRW' },
    provider: 'serpapi',
    ...overrides,
  };
}

function liveStay(overrides: Partial<AccommodationQuote> = {}): AccommodationQuote {
  return {
    totalStayKrw: 200_000,
    perPersonStayKrw: 200_000,
    propertyName: 'Hotel',
    summary: 'live stay',
    bookingUrl: 'https://example.com/h',
    isMock: false,
    priceMode: 'live',
    searchedAt: '2026-11-18T00:00:00.000Z',
    nights: 3,
    rooms: 1,
    travelers: 1,
    stats: { min: 200_000, max: 200_000, avg: 200_000, offerCount: 1, currency: 'KRW' },
    provider: 'serpapi',
    ...overrides,
  };
}

describe('classifyQuoteProvenance (cases 1–8)', () => {
  it('1. live + isMock=false + priceMode=live → live', () => {
    assert.equal(classifyQuoteProvenance({ isMock: false, priceMode: 'live' }), 'live');
  });

  it('2. priceMode=indicative → indicative', () => {
    assert.equal(classifyQuoteProvenance({ isMock: false, priceMode: 'indicative' }), 'indicative');
    assert.equal(classifyQuoteProvenance({ priceMode: 'indicative' }), 'indicative');
  });

  it('3. isMock=true → mock', () => {
    assert.equal(classifyQuoteProvenance({ isMock: true, priceMode: 'mock' }), 'mock');
    assert.equal(classifyQuoteProvenance({ isMock: true }), 'mock');
  });

  it('4. missing provenance → unknown', () => {
    assert.equal(classifyQuoteProvenance({}), 'unknown');
    assert.equal(classifyQuoteProvenance(null), 'unknown');
    assert.equal(classifyQuoteProvenance(undefined), 'unknown');
    assert.equal(classifyQuoteProvenance({ totalFareKrw: 100_000 }), 'unknown');
  });

  it('5. flight vs stay differ → saved summary shows each separately', () => {
    const summary = formatSavedTripProvenanceSummary(
      { isMock: true, priceMode: 'mock' },
      { isMock: false, priceMode: 'live' },
    );
    assert.equal(summary, '항공권 예시 가격 · 숙박 실시간 검색');
    assert.match(summary, /항공권/);
    assert.match(summary, /숙박/);
    assert.ok(!summary.includes('MOCK'));
  });

  it('6. contradictory isMock=true + priceMode=live → never live', () => {
    assert.equal(classifyQuoteProvenance({ isMock: true, priceMode: 'live' }), 'mock');
  });

  it('7. contradictory isMock=false + priceMode=mock → never live', () => {
    assert.equal(classifyQuoteProvenance({ isMock: false, priceMode: 'mock' }), 'mock');
  });

  it('8. never treat missing as mock; incomplete live signals → unknown', () => {
    assert.notEqual(classifyQuoteProvenance({}), 'mock');
    assert.equal(classifyQuoteProvenance({ isMock: false }), 'unknown');
    assert.equal(classifyQuoteProvenance({ priceMode: 'live' }), 'unknown');
  });
});

describe('saved / shared summaries (cases 5, 9)', () => {
  it('both live / both indicative / both unknown saved copy', () => {
    assert.equal(
      formatSavedTripProvenanceSummary(
        { isMock: false, priceMode: 'live' },
        { isMock: false, priceMode: 'live' },
      ),
      '항공권 실시간 검색 · 숙박 실시간 검색',
    );
    assert.equal(
      formatSavedTripProvenanceSummary(
        { isMock: false, priceMode: 'indicative' },
        { isMock: false, priceMode: 'indicative' },
      ),
      '항공권 예상 가격 · 숙박 예상 가격',
    );
    assert.equal(
      formatSavedTripProvenanceSummary({}, {}),
      '가격 출처 확인 불가',
    );
  });

  it('9. shared phrases: live / mock / mixed / indicative / unknown', () => {
    assert.equal(
      classifySharedTripProvenance(
        { isMock: false, priceMode: 'live' },
        { isMock: false, priceMode: 'live' },
      ),
      'live',
    );
    assert.equal(
      formatSharedTripProvenancePhrase(
        { isMock: false, priceMode: 'live' },
        { isMock: false, priceMode: 'live' },
      ),
      '저장 당시 실시간 검색 결과',
    );

    assert.equal(
      formatSharedTripProvenancePhrase(
        { isMock: true, priceMode: 'mock' },
        { isMock: true, priceMode: 'mock' },
      ),
      '예시 가격이 포함된 공유 결과',
    );

    assert.equal(
      formatSharedTripProvenancePhrase(
        { isMock: false, priceMode: 'live' },
        { isMock: true, priceMode: 'mock' },
      ),
      '실시간 검색 및 예시 가격 포함',
    );

    assert.equal(
      formatSharedTripProvenancePhrase(
        { isMock: false, priceMode: 'live' },
        { isMock: false, priceMode: 'indicative' },
      ),
      '일부 가격은 예상 가격입니다',
    );

    assert.equal(
      formatSharedTripProvenancePhrase({}, { isMock: false, priceMode: 'live' }),
      '일부 가격의 출처를 확인할 수 없습니다',
    );

    // Never call whole trip live unless both confirmed live.
    assert.notEqual(
      classifySharedTripProvenance(
        { isMock: false, priceMode: 'live' },
        { isMock: true, priceMode: 'mock' },
      ),
      'live',
    );
    assert.notEqual(
      classifySharedTripProvenance(
        { isMock: false, priceMode: 'live' },
        {},
      ),
      'live',
    );
  });

  it('share message headline has no blanket MOCK', () => {
    const live = formatShareMessageHeadline(
      { isMock: false, priceMode: 'live' },
      { isMock: false, priceMode: 'live' },
    );
    assert.match(live, /실시간 검색/);
    assert.ok(!live.includes('MOCK'));

    const mock = formatShareMessageHeadline(
      { isMock: true, priceMode: 'mock' },
      { isMock: true, priceMode: 'mock' },
    );
    assert.match(mock, /예시 가격/);
    assert.ok(!mock.includes('MOCK'));
  });
});

describe('normalizeRecommendationSnapshot provenance (case 10)', () => {
  it('10. does not overwrite or default isMock / priceMode on flight or lodging', () => {
    const liveRec = {
      destination: {
        id: 'osaka',
        city: '오사카',
        country: '일본',
        countryCode: 'JP',
        airportCode: 'KIX',
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
      flight: liveFlight(),
      lodging: liveStay({ isMock: true, priceMode: 'mock', provider: 'mock' }),
      searchCost: {
        flightTotalKrw: 300_000,
        stayTotalKrw: 200_000,
        searchCostTotalKrw: 500_000,
      },
      localSpend: { activityKrw: 1, foodKrw: 1, shoppingKrw: 1 },
      localSpendMeta: {
        source: 'catalog_daily_estimate' as const,
        confidence: 'low' as const,
        isEstimated: true as const,
      },
      localSpendTotalKrw: 3,
      breakdown: {
        flightKrw: 300_000,
        lodgingKrw: 200_000,
        activityKrw: 1,
        foodKrw: 1,
        shoppingKrw: 1,
      },
      estimatedTripTotalKrw: 503,
      estimatedTotalKrw: 503,
      totalBudgetKrw: 1_000_000,
      remainingKrw: 497,
      remainingPercent: 50,
      status: 'within_budget_estimate' as const,
      isMock: true,
    } satisfies DestinationRecommendation;

    const normalized = normalizeRecommendationSnapshot(liveRec);
    assert.equal(normalized.flight.isMock, false);
    assert.equal(normalized.flight.priceMode, 'live');
    assert.equal(normalized.lodging.isMock, true);
    assert.equal(normalized.lodging.priceMode, 'mock');

    // Legacy-shaped: omit priceMode / isMock on nested quotes via cast.
    const legacyQuotes = {
      ...liveRec,
      flight: { totalFareKrw: 300_000, carrier: 'X' } as FlightQuote,
      lodging: { totalStayKrw: 200_000, propertyName: 'Y' } as AccommodationQuote,
    };
    const legacyNormalized = normalizeRecommendationSnapshot(legacyQuotes);
    assert.equal(
      (legacyNormalized.flight as { isMock?: boolean }).isMock,
      (legacyQuotes.flight as { isMock?: boolean }).isMock,
    );
    assert.equal(
      (legacyNormalized.flight as { priceMode?: string }).priceMode,
      (legacyQuotes.flight as { priceMode?: string }).priceMode,
    );
    assert.equal(
      (legacyNormalized.lodging as { isMock?: boolean }).isMock,
      (legacyQuotes.lodging as { isMock?: boolean }).isMock,
    );
    assert.equal(
      (legacyNormalized.lodging as { priceMode?: string }).priceMode,
      (legacyQuotes.lodging as { priceMode?: string }).priceMode,
    );
    // Must not invent live/mock defaults.
    assert.equal((legacyNormalized.flight as { priceMode?: string }).priceMode, undefined);
    assert.equal((legacyNormalized.lodging as { isMock?: boolean }).isMock, undefined);
  });
});
