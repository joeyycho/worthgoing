import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import type { ServerEnv } from '../env.js';
import { SerpapiApiError } from '../serpapi/errors.js';
import {
  AccommodationSearchService,
  resolveActiveAccommodationProvider,
} from './service.js';
import {
  buildHotelsQuery,
  buildSerpapiHotelsParams,
  extractStayTotalKrw,
  resolveStayDates,
  searchSerpapiAccommodations,
} from './serpapiProvider.js';
import type { AccommodationSearchRequest } from './types.js';

function baseEnv(overrides: Partial<ServerEnv> = {}): ServerEnv {
  return {
    port: 8787,
    corsOrigin: '*',
    corsOrigins: '*',
    supabaseConfigured: false,
    supabaseUrl: null,
    serviceRoleKey: null,
    amadeusConfigured: false,
    amadeusClientId: null,
    amadeusClientSecret: null,
    amadeusHostname: 'test.api.amadeus.com',
    amadeusKrwPerEur: 1500,
    duffelConfigured: false,
    duffelAccessToken: null,
    duffelBaseUrl: 'https://api.duffel.com',
    duffelApiVersion: 'v2',
    duffelTimeoutMs: 5000,
    serpapiConfigured: true,
    serpapiApiKey: 'serpapi_test_dummy',
    serpapiBaseUrl: 'https://serpapi.com',
    serpapiTimeoutMs: 5000,
    serpapiGl: 'kr',
    serpapiHl: 'ko',
    serpapiCurrency: 'KRW',
    flightCacheTtlMs: 60_000,
    flightTimeoutMs: 5000,
    flightRateLimitPerMinute: 30,
    accommodationCacheTtlMs: 60_000,
    accommodationTimeoutMs: 5000,
    accommodationRateLimitPerMinute: 30,
    accommodationHotelIdLimit: 5,
    ...overrides,
  };
}

const datedQuery: AccommodationSearchRequest = {
  city: 'Osaka',
  country: 'Japan',
  cityCode: 'OSA',
  airportCode: 'KIX',
  destinationId: 'osaka',
  travelers: 2,
  nights: 3,
  checkInDate: '2026-06-01',
  checkOutDate: '2026-06-04',
};

const flexibleQuery: AccommodationSearchRequest = {
  ...datedQuery,
  checkInDate: '',
  checkOutDate: '',
};

function property(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Test Osaka Hotel',
    type: 'hotel',
    total_rate: {
      extracted_lowest: 300_000,
      extracted_before_taxes_fees: 270_000,
      extracted_after_taxes_fees: 300_000,
    },
    rate_per_night: {
      extracted_lowest: 100_000,
      extracted_before_taxes_fees: 90_000,
      extracted_after_taxes_fees: 100_000,
    },
    ...overrides,
  };
}

function mockJsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  };
}

function parseSearchParams(url: string | URL): URLSearchParams {
  return new URL(String(url)).searchParams;
}

afterEach(() => {
  mock.restoreAll();
});

describe('SerpApi hotels provider (20 mocked cases)', () => {
  it('1. dated search → priceMode live + provider serpapi', async () => {
    mock.method(globalThis, 'fetch', async () =>
      mockJsonResponse(200, { properties: [property()] }),
    );
    const quote = await searchSerpapiAccommodations(baseEnv(), datedQuery);
    assert.equal(quote.priceMode, 'live');
    assert.equal(quote.provider, 'serpapi');
    assert.equal(quote.isMock, false);
    assert.equal(quote.nights, 3);
  });

  it('2. flexible dates → indicative + synthetic check_in/out in request', async () => {
    let seenIn: string | null = null;
    let seenOut: string | null = null;
    mock.method(globalThis, 'fetch', async (url: string | URL) => {
      const params = parseSearchParams(url);
      seenIn = params.get('check_in_date');
      seenOut = params.get('check_out_date');
      return mockJsonResponse(200, { properties: [property()] });
    });
    const quote = await searchSerpapiAccommodations(baseEnv(), flexibleQuery);
    assert.equal(quote.priceMode, 'indicative');
    assert.ok(seenIn && /^\d{4}-\d{2}-\d{2}$/.test(seenIn));
    assert.ok(seenOut && /^\d{4}-\d{2}-\d{2}$/.test(seenOut));
    assert.ok(seenIn! < seenOut!);
  });

  it('3. total_rate.extracted_after_taxes_fees → totalStayKrw (priority 1)', async () => {
    mock.method(globalThis, 'fetch', async () =>
      mockJsonResponse(200, {
        properties: [
          property({
            total_rate: {
              extracted_after_taxes_fees: 374_000,
              extracted_lowest: 999_999,
              extracted_before_taxes_fees: 309_000,
            },
          }),
        ],
      }),
    );
    const quote = await searchSerpapiAccommodations(baseEnv(), datedQuery);
    assert.equal(quote.totalStayKrw, 374_000);
    assert.match(quote.summary, /세금·수수료 포함/);
  });

  it('4. total_rate.extracted_lowest when no after-tax (priority 2)', async () => {
    mock.method(globalThis, 'fetch', async () =>
      mockJsonResponse(200, {
        properties: [
          property({
            total_rate: {
              extracted_lowest: 339_000,
              extracted_before_taxes_fees: 300_000,
            },
            rate_per_night: { extracted_lowest: 68_000 },
          }),
        ],
      }),
    );
    const quote = await searchSerpapiAccommodations(baseEnv(), datedQuery);
    assert.equal(quote.totalStayKrw, 339_000);
    assert.match(quote.summary, /총액\(최저가\)/);
  });

  it('5. total_rate.extracted_before_taxes_fees only (priority 3) + summary mark', async () => {
    mock.method(globalThis, 'fetch', async () =>
      mockJsonResponse(200, {
        properties: [
          property({
            total_rate: { extracted_before_taxes_fees: 280_000 },
            rate_per_night: undefined,
          }),
        ],
      }),
    );
    const quote = await searchSerpapiAccommodations(baseEnv(), datedQuery);
    assert.equal(quote.totalStayKrw, 280_000);
    assert.match(quote.summary, /세금·수수료 미포함/);
  });

  it('6. prefer after-tax over before-tax when both exist on total_rate', () => {
    const extracted = extractStayTotalKrw(
      {
        total_rate: {
          extracted_after_taxes_fees: 374,
          extracted_before_taxes_fees: 309,
          extracted_lowest: 374,
        },
      },
      2,
    );
    assert.equal(extracted.source, 'total_after_tax');
    assert.equal(extracted.amount, 374);
  });

  it('7. only rate_per_night.extracted_lowest → × nights (not raw nightly)', async () => {
    mock.method(globalThis, 'fetch', async () =>
      mockJsonResponse(200, {
        properties: [
          property({
            total_rate: undefined,
            rate_per_night: { extracted_lowest: 100_000 },
          }),
        ],
      }),
    );
    const quote = await searchSerpapiAccommodations(baseEnv(), datedQuery);
    // 3 nights × 100_000 — never treat 100_000 as stay total
    assert.equal(quote.totalStayKrw, 300_000);
    assert.match(quote.summary, /1박×3박/);
  });

  it('8. never treat nightly as total; never multiply stay total by nights', () => {
    const nightlyOnly = extractStayTotalKrw(
      { rate_per_night: { extracted_lowest: 187 } },
      2,
    );
    assert.equal(nightlyOnly.amount, 374);
    assert.equal(nightlyOnly.source, 'nightly_lowest');

    const stayTotal = extractStayTotalKrw(
      { total_rate: { extracted_lowest: 374 } },
      2,
    );
    assert.equal(stayTotal.amount, 374);
    assert.notEqual(stayTotal.amount, 374 * 2);
  });

  it('9. rate_per_night.before_taxes × nights as last resort', () => {
    const extracted = extractStayTotalKrw(
      { rate_per_night: { extracted_before_taxes_fees: 90 } },
      3,
    );
    assert.equal(extracted.source, 'nightly_before_tax');
    assert.equal(extracted.amount, 270);
  });

  it('10. reject NaN / Inf / negative amounts → null', () => {
    assert.equal(
      extractStayTotalKrw({ total_rate: { extracted_lowest: Number.NaN } }, 2).amount,
      null,
    );
    assert.equal(
      extractStayTotalKrw(
        { total_rate: { extracted_lowest: Number.POSITIVE_INFINITY } },
        2,
      ).amount,
      null,
    );
    assert.equal(
      extractStayTotalKrw({ total_rate: { extracted_lowest: -10 } }, 2).amount,
      null,
    );
    assert.equal(
      extractStayTotalKrw({ rate_per_night: { extracted_lowest: -5 } }, 2).amount,
      null,
    );
  });

  it('11. mixed properties: ignore unpriced; min of priced', async () => {
    mock.method(globalThis, 'fetch', async () =>
      mockJsonResponse(200, {
        properties: [
          property({ name: 'No price', total_rate: undefined, rate_per_night: undefined }),
          property({
            name: 'Expensive',
            total_rate: { extracted_after_taxes_fees: 500_000 },
          }),
          property({
            name: 'Cheapest Inn',
            total_rate: { extracted_after_taxes_fees: 200_000 },
          }),
        ],
      }),
    );
    const quote = await searchSerpapiAccommodations(baseEnv(), datedQuery);
    assert.equal(quote.totalStayKrw, 200_000);
    assert.equal(quote.propertyName, 'Cheapest Inn');
    assert.equal(quote.stats.offerCount, 2);
  });

  it('12. all unpriced → null totals, provider serpapi, no throw', async () => {
    mock.method(globalThis, 'fetch', async () =>
      mockJsonResponse(200, {
        properties: [
          property({ name: 'A', total_rate: undefined, rate_per_night: undefined }),
          property({
            name: 'B',
            total_rate: { extracted_lowest: Number.NaN },
            rate_per_night: { extracted_lowest: Number.NaN },
          }),
        ],
      }),
    );
    const quote = await searchSerpapiAccommodations(baseEnv(), datedQuery);
    assert.equal(quote.provider, 'serpapi');
    assert.equal(quote.totalStayKrw, null);
    assert.equal(quote.perPersonStayKrw, null);
    assert.equal(quote.isMock, false);
  });

  it('13. empty properties[] → null totals, serpapi, no throw', async () => {
    mock.method(globalThis, 'fetch', async () =>
      mockJsonResponse(200, { properties: [] }),
    );
    const quote = await searchSerpapiAccommodations(baseEnv(), datedQuery);
    assert.equal(quote.provider, 'serpapi');
    assert.equal(quote.totalStayKrw, null);
    assert.equal(quote.stats.offerCount, 0);
  });

  it('14. ads[] ignored even when properties empty / unpriced', async () => {
    mock.method(globalThis, 'fetch', async () =>
      mockJsonResponse(200, {
        ads: [{ name: 'Sponsored', extracted_price: 50_000 }],
        properties: [],
      }),
    );
    const quote = await searchSerpapiAccommodations(baseEnv(), datedQuery);
    assert.equal(quote.totalStayKrw, null);
    assert.equal(quote.propertyName, '');
  });

  it('15. adults param equals travelers; rooms metadata only (not multiplied)', async () => {
    let adultsParam: string | null = null;
    mock.method(globalThis, 'fetch', async (url: string | URL) => {
      adultsParam = parseSearchParams(url).get('adults');
      return mockJsonResponse(200, {
        properties: [
          property({
            total_rate: { extracted_after_taxes_fees: 300_000 },
          }),
        ],
      });
    });
    const quote = await searchSerpapiAccommodations(baseEnv(), {
      ...datedQuery,
      travelers: 4,
      rooms: 2,
    });
    assert.equal(adultsParam, '4');
    assert.equal(quote.rooms, 2);
    // Google stay total must NOT be multiplied by local rooms
    assert.equal(quote.totalStayKrw, 300_000);
    assert.match(quote.summary, /adults=4/);
    assert.match(quote.summary, /rooms 미전송|객실 메타/);
  });

  it('16. perPersonStayKrw = round(totalStayKrw / travelers)', async () => {
    mock.method(globalThis, 'fetch', async () =>
      mockJsonResponse(200, {
        properties: [
          property({ total_rate: { extracted_after_taxes_fees: 301_000 } }),
        ],
      }),
    );
    const quote = await searchSerpapiAccommodations(baseEnv(), {
      ...datedQuery,
      travelers: 3,
    });
    assert.equal(quote.totalStayKrw, 301_000);
    assert.equal(quote.perPersonStayKrw, Math.round(301_000 / 3));
  });

  it('17. q = "city, country" (not IATA alone); sort_by=3; gl/hl/currency from env', async () => {
    let params: URLSearchParams | null = null;
    mock.method(globalThis, 'fetch', async (url: string | URL) => {
      params = parseSearchParams(url);
      return mockJsonResponse(200, { properties: [property()] });
    });
    await searchSerpapiAccommodations(
      baseEnv({ serpapiGl: 'kr', serpapiHl: 'ko', serpapiCurrency: 'KRW' }),
      datedQuery,
    );
    assert.equal(params!.get('engine'), 'google_hotels');
    assert.equal(params!.get('q'), 'Osaka, Japan');
    assert.equal(params!.get('sort_by'), '3');
    assert.equal(params!.get('gl'), 'kr');
    assert.equal(params!.get('hl'), 'ko');
    assert.equal(params!.get('currency'), 'KRW');
    assert.equal(params!.get('check_in_date'), '2026-06-01');
    assert.equal(params!.get('check_out_date'), '2026-06-04');
  });

  it('18. HTTP / API error throws SerpapiApiError (service → Mock)', async () => {
    mock.method(globalThis, 'fetch', async () =>
      mockJsonResponse(500, { error: 'upstream' }),
    );
    await assert.rejects(
      () => searchSerpapiAccommodations(baseEnv(), datedQuery),
      (error: unknown) => error instanceof SerpapiApiError,
    );
  });

  it('19. checkout after checkin; nights from dated window; cityCode via resolve', async () => {
    const dates = resolveStayDates(datedQuery);
    assert.equal(dates.checkInDate, '2026-06-01');
    assert.equal(dates.checkOutDate, '2026-06-04');
    assert.equal(dates.nights, 3);
    assert.equal(dates.flexible, false);

    const bad = resolveStayDates({
      ...datedQuery,
      checkInDate: '2026-06-04',
      checkOutDate: '2026-06-01',
      nights: 2,
    });
    assert.equal(bad.checkInDate, '2026-06-04');
    assert.equal(bad.checkOutDate, '2026-06-06');
    assert.equal(bad.nights, 2);

    mock.method(globalThis, 'fetch', async () =>
      mockJsonResponse(200, { properties: [property()] }),
    );
    const quote = await searchSerpapiAccommodations(baseEnv(), datedQuery);
    assert.equal(quote.cityCode, 'OSA');
    assert.equal(quote.bookingUrl, '');
  });

  it('20. unsupported currency → null stay total (no invented FX)', async () => {
    mock.method(globalThis, 'fetch', async () =>
      mockJsonResponse(200, {
        properties: [
          property({ total_rate: { extracted_after_taxes_fees: 500 } }),
        ],
      }),
    );
    const quote = await searchSerpapiAccommodations(
      baseEnv({ serpapiCurrency: 'JPY' }),
      datedQuery,
    );
    assert.equal(quote.provider, 'serpapi');
    assert.equal(quote.totalStayKrw, null);
  });
});

describe('extractStayTotalKrw / helpers', () => {
  it('buildHotelsQuery uses city + country', () => {
    assert.equal(buildHotelsQuery(datedQuery), 'Osaka, Japan');
    assert.equal(buildHotelsQuery({ ...datedQuery, country: '' }), 'Osaka');
  });

  it('buildSerpapiHotelsParams clamps adults 1–9', () => {
    const params = buildSerpapiHotelsParams(
      baseEnv(),
      { ...datedQuery, travelers: 20 },
      { checkInDate: '2026-06-01', checkOutDate: '2026-06-04' },
    );
    assert.equal(params.adults, 9);
  });

  it('priority skips total before-tax when after-tax present; nightly only after totals', () => {
    assert.equal(
      extractStayTotalKrw(
        {
          total_rate: { extracted_before_taxes_fees: 100 },
          rate_per_night: { extracted_lowest: 50 },
        },
        2,
      ).source,
      'total_before_tax',
    );
    assert.equal(
      extractStayTotalKrw(
        {
          total_rate: {},
          rate_per_night: {
            extracted_lowest: 50,
            extracted_before_taxes_fees: 40,
          },
        },
        2,
      ).amount,
      100,
    );
  });
});

describe('AccommodationSearchService SerpApi selection + cache', () => {
  it('selects SerpApi when configured (Amadeus not called)', async () => {
    assert.equal(
      resolveActiveAccommodationProvider(
        baseEnv({
          serpapiConfigured: true,
          amadeusConfigured: true,
          amadeusClientId: 'x',
          amadeusClientSecret: 'y',
        }),
      ),
      'serpapi',
    );

    let amadeusHits = 0;
    mock.method(globalThis, 'fetch', async (url: string | URL) => {
      if (String(url).includes('amadeus')) amadeusHits += 1;
      return mockJsonResponse(200, { properties: [property()] });
    });

    const service = new AccommodationSearchService(
      baseEnv({
        serpapiConfigured: true,
        amadeusConfigured: true,
        amadeusClientId: 'x',
        amadeusClientSecret: 'y',
      }),
      null,
    );
    const { quote } = await service.searchOne(datedQuery, null);
    assert.equal(quote.provider, 'serpapi');
    assert.equal(amadeusHits, 0);
  });

  it('SerpApi throw → Mock fallback', async () => {
    mock.method(globalThis, 'fetch', async () => mockJsonResponse(500, { error: 'boom' }));
    const service = new AccommodationSearchService(baseEnv(), null);
    const { quote } = await service.searchOne(datedQuery, null);
    assert.equal(quote.provider, 'mock');
    assert.equal(quote.isMock, true);
    assert.match(quote.summary, /SerpApi 실패 폴백/);
  });

  it('empty/unpriced SerpApi keeps provider serpapi — not Mock', async () => {
    mock.method(globalThis, 'fetch', async () =>
      mockJsonResponse(200, { properties: [] }),
    );
    const service = new AccommodationSearchService(baseEnv(), null);
    const { quote } = await service.searchOne(datedQuery, null);
    assert.equal(quote.provider, 'serpapi');
    assert.equal(quote.totalStayKrw, null);
    assert.equal(quote.isMock, false);
  });

  it('cache key includes active provider (serpapi vs mock differ)', async () => {
    let fetchCount = 0;
    mock.method(globalThis, 'fetch', async () => {
      fetchCount += 1;
      return mockJsonResponse(200, { properties: [property()] });
    });

    const serpapiService = new AccommodationSearchService(baseEnv(), null);
    await serpapiService.searchOne(datedQuery, null);
    await serpapiService.searchOne(datedQuery, null);
    assert.equal(fetchCount, 1, 'second serpapi call should hit cache');

    const mockService = new AccommodationSearchService(
      baseEnv({ serpapiConfigured: false, serpapiApiKey: null }),
      null,
    );
    const { quote } = await mockService.searchOne(datedQuery, null);
    assert.equal(quote.provider, 'mock');
    // mock path does not call fetch; proves provider segment separates cache namespaces
    assert.equal(fetchCount, 1);
  });

  it('Mock when SerpApi unset even if Amadeus keys present', async () => {
    assert.equal(
      resolveActiveAccommodationProvider(
        baseEnv({
          serpapiConfigured: false,
          serpapiApiKey: null,
          amadeusConfigured: true,
          amadeusClientId: 'x',
          amadeusClientSecret: 'y',
        }),
      ),
      'mock',
    );

    let amadeusHits = 0;
    mock.method(globalThis, 'fetch', async (url: string | URL) => {
      if (String(url).includes('amadeus')) amadeusHits += 1;
      return mockJsonResponse(200, { data: [] });
    });

    const service = new AccommodationSearchService(
      baseEnv({
        serpapiConfigured: false,
        serpapiApiKey: null,
        amadeusConfigured: true,
        amadeusClientId: 'x',
        amadeusClientSecret: 'y',
      }),
      null,
    );
    const { quote } = await service.searchOne(datedQuery, null);
    assert.equal(quote.provider, 'mock');
    assert.equal(amadeusHits, 0);
  });

  it('Mock when no live stay providers configured', async () => {
    assert.equal(
      resolveActiveAccommodationProvider(
        baseEnv({
          serpapiConfigured: false,
          serpapiApiKey: null,
          amadeusConfigured: false,
        }),
      ),
      'mock',
    );
    const service = new AccommodationSearchService(
      baseEnv({
        serpapiConfigured: false,
        serpapiApiKey: null,
        amadeusConfigured: false,
      }),
      null,
    );
    const { quote } = await service.searchOne(datedQuery, null);
    assert.equal(quote.provider, 'mock');
  });

  it('batch provider reports serpapi when any result is serpapi', async () => {
    mock.method(globalThis, 'fetch', async () =>
      mockJsonResponse(200, { properties: [property()] }),
    );
    const service = new AccommodationSearchService(baseEnv(), null);
    const batch = await service.searchBatch(
      {
        travelers: 2,
        nights: 3,
        checkInDate: '2026-06-01',
        checkOutDate: '2026-06-04',
        destinations: [
          {
            id: 'osaka',
            city: 'Osaka',
            country: 'Japan',
            cityCode: 'OSA',
            airportCode: 'KIX',
          },
        ],
      },
      null,
    );
    assert.equal(batch.provider, 'serpapi');
    assert.equal(batch.results[0]?.provider, 'serpapi');
  });
});
