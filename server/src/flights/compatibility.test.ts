import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import {
  AccommodationSearchService,
  resolveActiveAccommodationProvider,
} from '../accommodations/service.js';
import { persistAccommodationSearch } from '../accommodations/persist.js';
import type { AccommodationQuoteResult } from '../accommodations/types.js';
import type { ServerEnv } from '../env.js';
import { describeSerpapiClient } from '../serpapi/client.js';
import { persistFlightSearch } from './persist.js';
import { FlightSearchService, resolveActiveFlightProvider } from './service.js';
import type { FlightQuoteResult } from './types.js';

function baseEnv(overrides: Partial<ServerEnv> = {}): ServerEnv {
  return {
    port: 8787,
    corsOrigins: '*',
    supabaseUrl: null,
    supabaseServiceRoleKey: null,
    supabaseConfigured: false,
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
    flightRateLimitPerMinute: 60,
    accommodationCacheTtlMs: 60_000,
    accommodationRateLimitPerMinute: 60,
    ...overrides,
  } as ServerEnv;
}

function mockJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function flightQuote(overrides: Partial<FlightQuoteResult> = {}): FlightQuoteResult {
  return {
    totalFareKrw: null,
    currency: 'KRW',
    carrier: 'SerpApi',
    summary: 'null-by-policy',
    bookingUrl: '',
    isMock: false,
    priceMode: 'live',
    searchedAt: new Date().toISOString(),
    roundTrip: true,
    baggageNotes: null,
    stats: { min: null, max: null, avg: null, offerCount: 1, currency: 'KRW' },
    provider: 'serpapi',
    destinationId: 'osaka',
    destinationAirport: 'KIX',
    ...overrides,
  };
}

function stayQuote(overrides: Partial<AccommodationQuoteResult> = {}): AccommodationQuoteResult {
  return {
    totalStayKrw: 120_000,
    perPersonStayKrw: 60_000,
    currency: 'KRW',
    propertyName: 'Test Hotel',
    summary: '2박 · 세금·수수료 포함 총액',
    bookingUrl: '',
    isMock: false,
    priceMode: 'live',
    searchedAt: new Date().toISOString(),
    nights: 2,
    rooms: 1,
    travelers: 2,
    stats: { min: 120_000, max: 120_000, avg: 120_000, offerCount: 1, currency: 'KRW' },
    provider: 'serpapi',
    destinationId: 'osaka',
    city: 'Osaka',
    country: 'Japan',
    cityCode: 'OSA',
    ...overrides,
  };
}

describe('Step 5 compatibility — types / persist / cache / health', () => {
  it('provider unions: active resolvers are serpapi or mock only', () => {
    assert.equal(resolveActiveFlightProvider(baseEnv()), 'serpapi');
    assert.equal(resolveActiveAccommodationProvider(baseEnv()), 'serpapi');
    assert.equal(
      resolveActiveFlightProvider(
        baseEnv({
          serpapiConfigured: false,
          serpapiApiKey: null,
          duffelConfigured: true,
          duffelAccessToken: 'duffel_test',
        }),
      ),
      'mock',
    );
    assert.equal(
      resolveActiveFlightProvider(
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
    assert.equal(
      resolveActiveFlightProvider(
        baseEnv({ serpapiConfigured: false, serpapiApiKey: null }),
      ),
      'mock',
    );
  });

  it('persist accepts serpapi + null flight fare; failure does not throw', async () => {
    const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];

    function mockClient() {
      return {
        from(table: string) {
          return {
            insert(row: Record<string, unknown>) {
              inserts.push({ table, row });
              const builder = {
                select() {
                  return {
                    single: async () => ({ data: { id: 'search-1' }, error: null }),
                  };
                },
                then(
                  onFulfilled: (value: { data: null; error: null }) => unknown,
                  onRejected?: (reason: unknown) => unknown,
                ) {
                  return Promise.resolve({ data: null, error: null }).then(
                    onFulfilled,
                    onRejected,
                  );
                },
              };
              return builder;
            },
          };
        },
      };
    }

    const ok = await persistFlightSearch(
      mockClient() as never,
      {
        originAirports: ['ICN'],
        destinationAirport: 'KIX',
        travelers: 2,
        tripLengthDays: 3,
        departureDate: '2026-06-01',
        returnDate: '2026-06-04',
        destinationId: 'osaka',
      },
      flightQuote({ totalFareKrw: null, provider: 'serpapi' }),
      null,
    );
    assert.equal(ok, true);
    assert.equal(inserts[0]?.row.provider, 'serpapi');
    assert.equal(inserts[1]?.row.total_fare_krw, null);
    assert.equal(inserts[1]?.row.booking_url, '');

    const stayOk = await persistAccommodationSearch(
      mockClient() as never,
      {
        city: 'Osaka',
        country: 'Japan',
        travelers: 2,
        nights: 2,
        checkInDate: '2026-06-01',
        checkOutDate: '2026-06-03',
        destinationId: 'osaka',
      },
      stayQuote({ totalStayKrw: Number.NaN, provider: 'serpapi' }),
      null,
    );
    assert.equal(stayOk, true);
    assert.equal(inserts[2]?.row.provider, 'serpapi');
    assert.equal(inserts[3]?.row.total_stay_krw, null);

    const failed = await persistFlightSearch(
      {
        from() {
          throw new Error('supabase down');
        },
      } as never,
      {
        originAirports: ['ICN'],
        destinationAirport: 'KIX',
        travelers: 1,
        tripLengthDays: 3,
        departureDate: '2026-06-01',
        returnDate: '2026-06-04',
      },
      flightQuote({ provider: 'duffel', totalFareKrw: 100_000 }),
      null,
    );
    assert.equal(failed, false);
  });

  it('flight cache keys separate serpapi vs mock and dates/travelers', async () => {
    let fetchCount = 0;
    mock.method(globalThis, 'fetch', async () => {
      fetchCount += 1;
      return mockJsonResponse(200, {
        best_flights: [
          {
            price: 100_000,
            departure_token: 'tok',
            flights: [{ airline: 'KE', flight_number: 'KE123' }],
          },
        ],
      });
    });

    const serpapi = new FlightSearchService(baseEnv(), null);
    const query = {
      originAirports: ['ICN'],
      destinationAirport: 'KIX',
      travelers: 2,
      tripLengthDays: 3,
      departureDate: '2026-06-01',
      returnDate: '2026-06-04',
      destinationId: 'osaka',
    };
    // First search: outbound + departure_token return = 2 GETs, then cached
    await serpapi.searchOne(query, null);
    assert.equal(fetchCount, 2);
    await serpapi.searchOne(query, null);
    assert.equal(fetchCount, 2, 'identical query hits TTL cache');

    // Different travelers → different cache key
    await serpapi.searchOne({ ...query, travelers: 1 }, null);
    assert.equal(fetchCount, 4);

    // Different dates → different cache key
    await serpapi.searchOne(
      { ...query, departureDate: '2026-07-01', returnDate: '2026-07-04' },
      null,
    );
    assert.equal(fetchCount, 6);

    // Mock provider namespace differs from SerpApi
    const mockService = new FlightSearchService(
      baseEnv({ serpapiConfigured: false, serpapiApiKey: null }),
      null,
    );
    const mockResult = await mockService.searchOne(query, null);
    assert.equal(mockResult.quote.provider, 'mock');
  });

  it('stay cache keys already include active provider (serpapi ≠ mock)', async () => {
    let fetchCount = 0;
    mock.method(globalThis, 'fetch', async () => {
      fetchCount += 1;
      return mockJsonResponse(200, {
        properties: [
          {
            name: 'Hotel A',
            total_rate: { extracted_after_taxes_fees: 90_000 },
          },
        ],
      });
    });

    const query = {
      city: 'Osaka',
      country: 'Japan',
      travelers: 2,
      nights: 2,
      checkInDate: '2026-06-01',
      checkOutDate: '2026-06-03',
      destinationId: 'osaka',
    };

    const serpapi = new AccommodationSearchService(baseEnv(), null);
    await serpapi.searchOne(query, null);
    await serpapi.searchOne(query, null);
    assert.equal(fetchCount, 1);

    const mockService = new AccommodationSearchService(
      baseEnv({ serpapiConfigured: false, serpapiApiKey: null }),
      null,
    );
    const mockResult = await mockService.searchOne(query, null);
    assert.equal(mockResult.quote.provider, 'mock');
    assert.equal(fetchCount, 1, 'mock path must not reuse serpapi cache namespace');
  });

  it('health signals: serpapiConfigured ≠ active providers; no key leakage', () => {
    const configured = baseEnv();
    const info = describeSerpapiClient(configured);
    assert.equal(configured.serpapiConfigured, true);
    assert.equal(resolveActiveFlightProvider(configured), 'serpapi');
    assert.equal(resolveActiveAccommodationProvider(configured), 'serpapi');
    assert.equal(info.configured, true);
    assert.equal('apiKey' in info, false);
    assert.equal(JSON.stringify(info).includes('serpapi_test_dummy'), false);

    const unset = baseEnv({
      serpapiConfigured: false,
      serpapiApiKey: null,
      duffelConfigured: true,
      duffelAccessToken: 'duffel_test',
      amadeusConfigured: true,
      amadeusClientId: 'x',
      amadeusClientSecret: 'y',
    });
    assert.equal(unset.serpapiConfigured, false);
    assert.equal(unset.duffelConfigured, true);
    assert.equal(unset.amadeusConfigured, true);
    assert.equal(resolveActiveFlightProvider(unset), 'mock');
    assert.equal(resolveActiveAccommodationProvider(unset), 'mock');
  });

  it('legacy Duffel / Amadeus / Mock quotes remain readable shapes', () => {
    for (const provider of ['duffel', 'amadeus', 'mock'] as const) {
      const quote = flightQuote({
        provider,
        totalFareKrw: provider === 'mock' ? 50_000 : 80_000,
        isMock: provider === 'mock',
      });
      assert.equal(typeof quote.summary, 'string');
      assert.ok(quote.totalFareKrw == null || Number.isFinite(quote.totalFareKrw));
    }
    for (const provider of ['amadeus', 'mock'] as const) {
      const quote = stayQuote({
        provider,
        isMock: provider === 'mock',
      });
      assert.equal(typeof quote.propertyName, 'string');
      assert.ok(quote.totalStayKrw == null || Number.isFinite(quote.totalStayKrw));
    }
  });
});
