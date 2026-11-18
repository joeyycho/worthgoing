import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import type { ServerEnv } from '../env.js';
import { SerpapiApiError } from '../serpapi/errors.js';
import { FlightSearchService, resolveActiveFlightProvider } from './service.js';
import {
  SERPAPI_PARTY_RT_FARE_VERIFIED,
  buildSerpapiFlightsParams,
  collectFlightOptions,
  extractBaggageNotes,
  pickOutboundOption,
  pickReturnOption,
  searchSerpapiFlights,
  toPartyTotalFareKrw,
} from './serpapiProvider.js';
import type { FlightSearchRequest } from './types.js';

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

const datedQuery: FlightSearchRequest = {
  originAirports: ['ICN'],
  destinationAirport: 'KIX',
  destinationId: 'osaka',
  travelers: 2,
  tripLengthDays: 5,
  departureDate: '2026-06-01',
  returnDate: '2026-06-05',
};

const flexibleQuery: FlightSearchRequest = {
  ...datedQuery,
  departureDate: '',
  returnDate: '',
};

function flightOption(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    flights: [
      {
        departure_airport: { id: 'ICN', name: 'Incheon', time: '2026-06-01 09:00' },
        arrival_airport: { id: 'KIX', name: 'Kansai', time: '2026-06-01 11:10' },
        duration: 130,
        airline: 'Korean Air',
        flight_number: 'KE721',
        extensions: [],
      },
    ],
    total_duration: 130,
    price: 420_000,
    type: 'Round trip',
    departure_token: 'token-out-ke721',
    extensions: [],
    ...overrides,
  };
}

function returnOption(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    flights: [
      {
        departure_airport: { id: 'KIX', name: 'Kansai', time: '2026-06-05 18:00' },
        arrival_airport: { id: 'ICN', name: 'Incheon', time: '2026-06-05 20:20' },
        duration: 140,
        airline: 'Korean Air',
        flight_number: 'KE722',
        extensions: [],
      },
    ],
    total_duration: 140,
    price: 450_000,
    type: 'Round trip',
    booking_token: 'book-token',
    extensions: [],
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

describe('SerpApi flights provider (16 mocked HTTP cases)', () => {
  it('1. dated search → priceMode live + provider serpapi', async () => {
    mock.method(globalThis, 'fetch', async (url: string | URL) => {
      const params = parseSearchParams(url);
      if (params.get('departure_token')) {
        return mockJsonResponse(200, { best_flights: [returnOption()], other_flights: [] });
      }
      return mockJsonResponse(200, {
        best_flights: [flightOption()],
        other_flights: [],
      });
    });
    const quote = await searchSerpapiFlights(baseEnv(), datedQuery);
    assert.equal(quote.priceMode, 'live');
    assert.equal(quote.provider, 'serpapi');
    assert.equal(quote.isMock, false);
    assert.equal(quote.roundTrip, true);
  });

  it('2. flexible search → indicative + synthetic dated request', async () => {
    const captured: URLSearchParams[] = [];
    mock.method(globalThis, 'fetch', async (url: string | URL) => {
      const params = parseSearchParams(url);
      captured.push(params);
      if (params.get('departure_token')) {
        return mockJsonResponse(200, { best_flights: [returnOption()], other_flights: [] });
      }
      return mockJsonResponse(200, {
        best_flights: [flightOption()],
        other_flights: [],
      });
    });
    const quote = await searchSerpapiFlights(baseEnv(), flexibleQuery);
    assert.equal(quote.priceMode, 'indicative');
    assert.match(captured[0].get('outbound_date') ?? '', /^\d{4}-\d{2}-\d{2}$/);
    assert.match(captured[0].get('return_date') ?? '', /^\d{4}-\d{2}-\d{2}$/);
    assert.match(quote.summary, /유연 일정/);
  });

  it('3. request mapping: engine/type/adults/travel_class/currency/gl/hl + ICN fallback', () => {
    const params = buildSerpapiFlightsParams(
      baseEnv(),
      { ...datedQuery, originAirports: [], travelers: 3 },
    );
    assert.equal(params.engine, 'google_flights');
    assert.equal(params.departure_id, 'ICN');
    assert.equal(params.arrival_id, 'KIX');
    assert.equal(params.type, 1);
    assert.equal(params.adults, 3);
    assert.equal(params.travel_class, 1);
    assert.equal(params.currency, 'KRW');
    assert.equal(params.gl, 'kr');
    assert.equal(params.hl, 'ko');
    assert.equal(params.outbound_date, '2026-06-01');
    assert.equal(params.return_date, '2026-06-05');
  });

  it('4. parses best_flights + other_flights together', () => {
    const options = collectFlightOptions({
      best_flights: [flightOption({ departure_token: 'a', price: 500_000 })],
      other_flights: [flightOption({ departure_token: 'b', price: 300_000 })],
    });
    assert.equal(options.length, 2);
    const picked = pickOutboundOption(options);
    assert.equal(picked?.departure_token, 'b');
  });

  it('5. departure_token second request + outbound↔inbound summary', async () => {
    const urls: string[] = [];
    mock.method(globalThis, 'fetch', async (url: string | URL) => {
      urls.push(String(url));
      const params = parseSearchParams(url);
      if (params.get('departure_token') === 'token-out-ke721') {
        return mockJsonResponse(200, {
          best_flights: [returnOption()],
          other_flights: [],
        });
      }
      return mockJsonResponse(200, {
        best_flights: [flightOption()],
        other_flights: [
          flightOption({
            price: 999_999,
            departure_token: 'token-expensive',
            flights: [
              {
                airline: 'Other Air',
                flight_number: 'XX1',
                departure_airport: { time: '2026-06-01 20:00' },
                arrival_airport: { time: '2026-06-01 22:00' },
              },
            ],
          }),
        ],
      });
    });
    const quote = await searchSerpapiFlights(baseEnv(), datedQuery);
    assert.equal(urls.length, 2);
    assert.match(urls[1], /departure_token=token-out-ke721/);
    assert.match(quote.summary, /가는편/);
    assert.match(quote.summary, /KE721/);
    assert.match(quote.summary, /오는편/);
    assert.match(quote.summary, /KE722/);
    assert.doesNotMatch(quote.summary, /오는편 미확인/);
  });

  it('6. no departure_token → no second request; summary says return unconfirmed', async () => {
    let calls = 0;
    mock.method(globalThis, 'fetch', async () => {
      calls += 1;
      return mockJsonResponse(200, {
        best_flights: [flightOption({ departure_token: undefined, price: 100_000 })],
        other_flights: [],
      });
    });
    const quote = await searchSerpapiFlights(baseEnv(), datedQuery);
    assert.equal(calls, 1);
    assert.match(quote.summary, /오는편 미확인/);
    assert.doesNotMatch(quote.summary, /오는편 확인됨/);
  });

  it('7. party RT fare unverified → totalFareKrw null by policy (even with KRW prices)', async () => {
    assert.equal(SERPAPI_PARTY_RT_FARE_VERIFIED, false);
    mock.method(globalThis, 'fetch', async (url: string | URL) => {
      const params = parseSearchParams(url);
      if (params.get('departure_token')) {
        return mockJsonResponse(200, { best_flights: [returnOption({ price: 450_000 })] });
      }
      return mockJsonResponse(200, { best_flights: [flightOption({ price: 420_000 })] });
    });
    const quote = await searchSerpapiFlights(baseEnv(), datedQuery);
    assert.equal(quote.totalFareKrw, null);
    assert.equal(quote.stats.min, null);
    assert.match(quote.summary, /미검증/);
  });

  it('8. toPartyTotalFareKrw: unverified → null; verified rules unit-tested', () => {
    const env = baseEnv();
    assert.equal(
      toPartyTotalFareKrw({
        displayedPrice: 200_000,
        adults: 2,
        currency: 'KRW',
        env,
        verified: false,
        rule: null,
      }),
      null,
    );
    assert.equal(
      toPartyTotalFareKrw({
        displayedPrice: 200_000,
        adults: 2,
        currency: 'KRW',
        env,
        verified: true,
        rule: 'party_total',
      }),
      200_000,
    );
    assert.equal(
      toPartyTotalFareKrw({
        displayedPrice: 200_000,
        adults: 2,
        currency: 'KRW',
        env,
        verified: true,
        rule: 'per_adult',
      }),
      400_000,
    );
    assert.equal(
      toPartyTotalFareKrw({
        displayedPrice: 100,
        adults: 2,
        currency: 'EUR',
        env: baseEnv({ amadeusKrwPerEur: 1500 }),
        verified: true,
        rule: 'party_total',
      }),
      150_000,
    );
    assert.equal(
      toPartyTotalFareKrw({
        displayedPrice: 100,
        adults: 2,
        currency: 'JPY',
        env,
        verified: true,
        rule: 'party_total',
      }),
      null,
    );
  });

  it('9. empty flight lists → null fare, provider serpapi, not throw', async () => {
    mock.method(globalThis, 'fetch', async () =>
      mockJsonResponse(200, { best_flights: [], other_flights: [] }),
    );
    const quote = await searchSerpapiFlights(baseEnv(), datedQuery);
    assert.equal(quote.provider, 'serpapi');
    assert.equal(quote.totalFareKrw, null);
    assert.equal(quote.stats.offerCount, 0);
    assert.equal(quote.isMock, false);
  });

  it('10. missing prices still serpapi with null fare', async () => {
    mock.method(globalThis, 'fetch', async (url: string | URL) => {
      const params = parseSearchParams(url);
      if (params.get('departure_token')) {
        return mockJsonResponse(200, {
          best_flights: [returnOption({ price: undefined })],
        });
      }
      return mockJsonResponse(200, {
        best_flights: [flightOption({ price: undefined, departure_token: 't1' })],
      });
    });
    const quote = await searchSerpapiFlights(baseEnv(), datedQuery);
    assert.equal(quote.provider, 'serpapi');
    assert.equal(quote.totalFareKrw, null);
    assert.equal(quote.stats.offerCount, 1);
  });

  it('11. HTTP 401 → SerpapiApiError throw', async () => {
    mock.method(globalThis, 'fetch', async () =>
      mockJsonResponse(401, { error: 'Invalid API key' }),
    );
    await assert.rejects(
      () => searchSerpapiFlights(baseEnv(), datedQuery),
      (error: unknown) => {
        assert.ok(error instanceof SerpapiApiError);
        assert.equal(error.status, 401);
        return true;
      },
    );
  });

  it('12. carrier + flight number from first leg; no invention when absent', async () => {
    mock.method(globalThis, 'fetch', async (url: string | URL) => {
      const params = parseSearchParams(url);
      if (params.get('departure_token')) {
        return mockJsonResponse(200, { best_flights: [returnOption()] });
      }
      return mockJsonResponse(200, {
        best_flights: [
          flightOption({
            flights: [
              {
                departure_airport: { time: '2026-06-01 09:00' },
                arrival_airport: { time: '2026-06-01 11:00' },
                airline: 'Asiana Airlines',
                flight_number: 'OZ112',
              },
            ],
          }),
        ],
      });
    });
    const quote = await searchSerpapiFlights(baseEnv(), datedQuery);
    assert.equal(quote.carrier, 'Asiana Airlines');
    assert.match(quote.summary, /OZ112/);

    mock.restoreAll();
    mock.method(globalThis, 'fetch', async () =>
      mockJsonResponse(200, {
        best_flights: [
          {
            flights: [{ departure_airport: { time: '2026-06-01 09:00' } }],
            departure_token: undefined,
          },
        ],
      }),
    );
    const sparse = await searchSerpapiFlights(baseEnv(), datedQuery);
    assert.equal(sparse.carrier, 'SerpApi');
    assert.doesNotMatch(sparse.summary, /KE\d+/);
    assert.doesNotMatch(sparse.summary, /가는편 Korean Air/);
  });

  it('13. bookingUrl always empty', async () => {
    mock.method(globalThis, 'fetch', async (url: string | URL) => {
      const params = parseSearchParams(url);
      if (params.get('departure_token')) {
        return mockJsonResponse(200, {
          best_flights: [returnOption({ booking_token: 'abc' })],
        });
      }
      return mockJsonResponse(200, { best_flights: [flightOption()] });
    });
    const quote = await searchSerpapiFlights(baseEnv(), datedQuery);
    assert.equal(quote.bookingUrl, '');
  });

  it('14. baggageNotes only when extensions affirm inclusion', () => {
    assert.equal(extractBaggageNotes(flightOption() as never, returnOption() as never), null);
    assert.equal(
      extractBaggageNotes(
        flightOption({ extensions: ['Checked baggage for a fee'] }) as never,
        null,
      ),
      null,
    );
    const notes = extractBaggageNotes(
      flightOption({ extensions: ['Free checked bag included'] }) as never,
      null,
    );
    assert.ok(notes?.includes('수하물'));
  });

  it('15. adults query param equals travelers', async () => {
    let adultsParam: string | null = null;
    mock.method(globalThis, 'fetch', async (url: string | URL) => {
      const params = parseSearchParams(url);
      if (!params.get('departure_token')) {
        adultsParam = params.get('adults');
      }
      if (params.get('departure_token')) {
        return mockJsonResponse(200, { best_flights: [returnOption()] });
      }
      return mockJsonResponse(200, { best_flights: [flightOption()] });
    });
    await searchSerpapiFlights(baseEnv(), { ...datedQuery, travelers: 4 });
    assert.equal(adultsParam, '4');
  });

  it('16. pickOutboundOption / pickReturnOption deterministic ordering', () => {
    const outbound = pickOutboundOption([
      flightOption({
        departure_token: 'late',
        price: 300_000,
        total_duration: 200,
        flights: [{ airline: 'A', departure_airport: { time: '2026-06-01 18:00' } }],
      }) as never,
      flightOption({
        departure_token: 'best',
        price: 300_000,
        total_duration: 120,
        flights: [{ airline: 'B', departure_airport: { time: '2026-06-01 09:00' } }],
      }) as never,
      flightOption({
        departure_token: '',
        price: 100_000,
      }) as never,
    ]);
    assert.equal(outbound?.departure_token, 'best');

    const inbound = pickReturnOption([
      returnOption({ price: 500_000 }) as never,
      returnOption({ price: 400_000, total_duration: 100 }) as never,
      returnOption({ price: undefined }) as never,
    ]);
    assert.equal(inbound?.price, 400_000);
  });
});

describe('FlightSearchService SerpApi selection', () => {
  it('selects SerpApi when configured (Duffel/Amadeus not called)', async () => {
    assert.equal(
      resolveActiveFlightProvider(
        baseEnv({
          serpapiConfigured: true,
          duffelConfigured: true,
          duffelAccessToken: 'duffel_test',
          amadeusConfigured: true,
          amadeusClientId: 'x',
          amadeusClientSecret: 'y',
        }),
      ),
      'serpapi',
    );

    let duffelHits = 0;
    let amadeusHits = 0;
    mock.method(globalThis, 'fetch', async (url: string | URL) => {
      const href = String(url);
      if (href.includes('duffel')) duffelHits += 1;
      if (href.includes('amadeus')) amadeusHits += 1;
      const params = parseSearchParams(url);
      if (params.get('departure_token')) {
        return mockJsonResponse(200, { best_flights: [returnOption()] });
      }
      return mockJsonResponse(200, { best_flights: [flightOption()] });
    });

    const service = new FlightSearchService(
      baseEnv({
        serpapiConfigured: true,
        duffelConfigured: true,
        duffelAccessToken: 'duffel_test',
        amadeusConfigured: true,
        amadeusClientId: 'x',
        amadeusClientSecret: 'y',
      }),
      null,
    );
    const { quote } = await service.searchOne(datedQuery, null);
    assert.equal(quote.provider, 'serpapi');
    assert.equal(duffelHits, 0);
    assert.equal(amadeusHits, 0);
  });

  it('SerpApi throw → Mock fallback', async () => {
    mock.method(globalThis, 'fetch', async () => mockJsonResponse(500, { error: 'upstream' }));
    const service = new FlightSearchService(baseEnv(), null);
    const { quote } = await service.searchOne(datedQuery, null);
    assert.equal(quote.provider, 'mock');
    assert.equal(quote.isMock, true);
    assert.match(quote.summary, /SerpApi 실패 폴백/);
  });

  it('empty SerpApi (null fare) keeps provider serpapi — not Mock', async () => {
    mock.method(globalThis, 'fetch', async () =>
      mockJsonResponse(200, { best_flights: [], other_flights: [] }),
    );
    const service = new FlightSearchService(baseEnv(), null);
    const { quote } = await service.searchOne(datedQuery, null);
    assert.equal(quote.provider, 'serpapi');
    assert.equal(quote.totalFareKrw, null);
    assert.equal(quote.isMock, false);
  });

  it('Duffel when SerpApi unset', async () => {
    assert.equal(
      resolveActiveFlightProvider(
        baseEnv({
          serpapiConfigured: false,
          serpapiApiKey: null,
          duffelConfigured: true,
          duffelAccessToken: 'duffel_test',
          amadeusConfigured: true,
        }),
      ),
      'duffel',
    );
  });

  it('Amadeus when SerpApi + Duffel unset', async () => {
    assert.equal(
      resolveActiveFlightProvider(
        baseEnv({
          serpapiConfigured: false,
          serpapiApiKey: null,
          duffelConfigured: false,
          amadeusConfigured: true,
        }),
      ),
      'amadeus',
    );
  });

  it('Mock when no live providers configured', async () => {
    assert.equal(
      resolveActiveFlightProvider(
        baseEnv({
          serpapiConfigured: false,
          serpapiApiKey: null,
          duffelConfigured: false,
          amadeusConfigured: false,
        }),
      ),
      'mock',
    );
    const service = new FlightSearchService(
      baseEnv({
        serpapiConfigured: false,
        serpapiApiKey: null,
        duffelConfigured: false,
        amadeusConfigured: false,
      }),
      null,
    );
    const { quote } = await service.searchOne(datedQuery, null);
    assert.equal(quote.provider, 'mock');
  });
});
