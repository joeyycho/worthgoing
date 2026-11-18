import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import type { ServerEnv } from '../env.js';
import { DuffelApiError } from '../duffel/errors.js';
import {
  buildOfferRequestBody,
  extractBaggageNotes,
  searchDuffelFlights,
} from './duffelProvider.js';
import { FlightSearchService, resolveActiveFlightProvider } from './service.js';
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
    duffelConfigured: true,
    duffelAccessToken: 'duffel_test_dummy',
    duffelBaseUrl: 'https://api.duffel.com',
    duffelApiVersion: 'v2',
    duffelTimeoutMs: 5000,
    serpapiConfigured: false,
    serpapiApiKey: null,
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

function offerFixture(overrides: Record<string, unknown> = {}) {
  return {
    total_amount: '500000',
    total_currency: 'KRW',
    owner: { name: 'Korean Air', iata_code: 'KE' },
    slices: [
      {
        segments: [
          {
            operating_carrier: { name: 'Korean Air', iata_code: 'KE' },
            marketing_carrier: { name: 'Korean Air', iata_code: 'KE' },
            passengers: [{ baggages: [] }],
          },
        ],
      },
    ],
    ...overrides,
  };
}

function mockJsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? headers[name] ?? null,
    },
    text: async () => JSON.stringify(body),
  };
}

afterEach(() => {
  mock.restoreAll();
});

describe('Duffel flights provider (15 mocked HTTP cases)', () => {
  it('1. dated search → priceMode live', async () => {
    mock.method(globalThis, 'fetch', async () =>
      mockJsonResponse(200, { data: { offers: [offerFixture()] } }),
    );
    const quote = await searchDuffelFlights(baseEnv(), datedQuery);
    assert.equal(quote.priceMode, 'live');
    assert.equal(quote.provider, 'duffel');
    assert.equal(quote.isMock, false);
  });

  it('2. flexible search → indicative + synthetic dated slices', async () => {
    let capturedBody: unknown;
    mock.method(globalThis, 'fetch', async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body));
      return mockJsonResponse(200, { data: { offers: [offerFixture()] } });
    });
    const quote = await searchDuffelFlights(baseEnv(), flexibleQuery);
    assert.equal(quote.priceMode, 'indicative');
    const body = capturedBody as {
      data: { slices: Array<{ departure_date: string }> };
    };
    assert.equal(body.data.slices.length, 2);
    assert.match(body.data.slices[0].departure_date, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(body.data.slices[1].departure_date, /^\d{4}-\d{2}-\d{2}$/);
  });

  it('3. KRW offer → totalFareKrw set', async () => {
    mock.method(globalThis, 'fetch', async () =>
      mockJsonResponse(200, {
        data: { offers: [offerFixture({ total_amount: '420000', total_currency: 'KRW' })] },
      }),
    );
    const quote = await searchDuffelFlights(baseEnv(), datedQuery);
    assert.equal(quote.totalFareKrw, 420_000);
    assert.equal(quote.currency, 'KRW');
  });

  it('4. EUR offer → KRW via EUR FX env only', async () => {
    mock.method(globalThis, 'fetch', async () =>
      mockJsonResponse(200, {
        data: { offers: [offerFixture({ total_amount: '100', total_currency: 'EUR' })] },
      }),
    );
    const quote = await searchDuffelFlights(baseEnv({ amadeusKrwPerEur: 1500 }), datedQuery);
    assert.equal(quote.totalFareKrw, 150_000);
    assert.equal(quote.currency, 'KRW');
  });

  it('5. unsupported currency → no false KRW', async () => {
    mock.method(globalThis, 'fetch', async () =>
      mockJsonResponse(200, {
        data: { offers: [offerFixture({ total_amount: '80000', total_currency: 'JPY' })] },
      }),
    );
    const quote = await searchDuffelFlights(baseEnv(), datedQuery);
    assert.equal(quote.totalFareKrw, null);
    assert.equal(quote.currency, 'JPY');
    assert.equal(quote.stats.currency, 'JPY');
    assert.equal(quote.stats.offerCount, 1);
  });

  it('6. empty offers → null fare', async () => {
    mock.method(globalThis, 'fetch', async () =>
      mockJsonResponse(200, { data: { offers: [] } }),
    );
    const quote = await searchDuffelFlights(baseEnv(), datedQuery);
    assert.equal(quote.totalFareKrw, null);
    assert.equal(quote.stats.offerCount, 0);
  });

  it('7. multiple offers → min/avg/max stats', async () => {
    mock.method(globalThis, 'fetch', async () =>
      mockJsonResponse(200, {
        data: {
          offers: [
            offerFixture({ total_amount: '300000', total_currency: 'KRW' }),
            offerFixture({ total_amount: '500000', total_currency: 'KRW' }),
            offerFixture({ total_amount: '400000', total_currency: 'KRW' }),
          ],
        },
      }),
    );
    const quote = await searchDuffelFlights(baseEnv(), datedQuery);
    assert.equal(quote.stats.min, 300_000);
    assert.equal(quote.stats.max, 500_000);
    assert.equal(quote.stats.avg, 400_000);
    assert.equal(quote.stats.offerCount, 3);
    assert.equal(quote.totalFareKrw, 300_000);
  });

  it('8. carrier from operating_carrier', async () => {
    mock.method(globalThis, 'fetch', async () =>
      mockJsonResponse(200, {
        data: {
          offers: [
            offerFixture({
              owner: { name: 'Owner Airline' },
              slices: [
                {
                  segments: [
                    {
                      operating_carrier: { name: 'Asiana Airlines', iata_code: 'OZ' },
                      marketing_carrier: { name: 'United', iata_code: 'UA' },
                      passengers: [],
                    },
                  ],
                },
              ],
            }),
          ],
        },
      }),
    );
    const quote = await searchDuffelFlights(baseEnv(), datedQuery);
    assert.equal(quote.carrier, 'Asiana Airlines');
  });

  it('9. baggage notes when Duffel provides baggages', async () => {
    const withBags = offerFixture({
      slices: [
        {
          segments: [
            {
              operating_carrier: { name: 'KE' },
              passengers: [{ baggages: [{ type: 'checked', quantity: 1 }] }],
            },
          ],
        },
      ],
    });
    assert.match(extractBaggageNotes(withBags) ?? '', /체크인/);
    mock.method(globalThis, 'fetch', async () =>
      mockJsonResponse(200, { data: { offers: [withBags] } }),
    );
    const quote = await searchDuffelFlights(baseEnv(), datedQuery);
    assert.ok(quote.baggageNotes?.includes('1'));
  });

  it('10. baggageNotes null when absent', async () => {
    mock.method(globalThis, 'fetch', async () =>
      mockJsonResponse(200, { data: { offers: [offerFixture()] } }),
    );
    const quote = await searchDuffelFlights(baseEnv(), datedQuery);
    assert.equal(quote.baggageNotes, null);
  });

  it('11. bookingUrl always empty (no invented deep links)', async () => {
    mock.method(globalThis, 'fetch', async () =>
      mockJsonResponse(200, { data: { offers: [offerFixture()] } }),
    );
    const quote = await searchDuffelFlights(baseEnv(), datedQuery);
    assert.equal(quote.bookingUrl, '');
  });

  it('12. HTTP error → DuffelApiError', async () => {
    mock.method(globalThis, 'fetch', async () =>
      mockJsonResponse(
        401,
        { errors: [{ message: 'invalid token', type: 'authentication_error' }] },
        { 'x-request-id': 'req_test' },
      ),
    );
    await assert.rejects(
      () => searchDuffelFlights(baseEnv(), datedQuery),
      (error: unknown) => {
        assert.ok(error instanceof DuffelApiError);
        assert.equal(error.status, 401);
        return true;
      },
    );
  });

  it('13. request payload: 2 round-trip slices + traveler passengers', () => {
    const built = buildOfferRequestBody({ ...datedQuery, travelers: 3 });
    assert.equal(built.data.slices.length, 2);
    assert.equal(built.data.slices[0].origin, 'ICN');
    assert.equal(built.data.slices[0].destination, 'KIX');
    assert.equal(built.data.slices[1].origin, 'KIX');
    assert.equal(built.data.slices[1].destination, 'ICN');
    assert.equal(built.data.passengers.length, 3);
    assert.ok(built.data.passengers.every((p) => p.type === 'adult'));
    assert.equal(built.flexible, false);
  });

  it('14. service prefers Duffel when token set (Amadeus not called)', async () => {
    assert.equal(
      resolveActiveFlightProvider(
        baseEnv({ duffelConfigured: true, amadeusConfigured: true }),
      ),
      'duffel',
    );

    let amadeusHits = 0;
    mock.method(globalThis, 'fetch', async (url: string | URL) => {
      const href = String(url);
      if (href.includes('amadeus')) {
        amadeusHits += 1;
      }
      return mockJsonResponse(200, { data: { offers: [offerFixture()] } });
    });

    const service = new FlightSearchService(
      baseEnv({ duffelConfigured: true, amadeusConfigured: true, amadeusClientId: 'x', amadeusClientSecret: 'y' }),
      null,
    );
    const { quote } = await service.searchOne(datedQuery, null);
    assert.equal(quote.provider, 'duffel');
    assert.equal(amadeusHits, 0);
  });

  it('15. service: Duffel failure → Mock (not Amadeus)', async () => {
    mock.method(globalThis, 'fetch', async () =>
      mockJsonResponse(500, { errors: [{ message: 'upstream' }] }),
    );
    const service = new FlightSearchService(
      baseEnv({
        duffelConfigured: true,
        amadeusConfigured: true,
        amadeusClientId: 'x',
        amadeusClientSecret: 'y',
      }),
      null,
    );
    const { quote } = await service.searchOne(datedQuery, null);
    assert.equal(quote.provider, 'mock');
    assert.equal(quote.isMock, true);
    assert.match(quote.summary, /Duffel 실패 폴백/);
  });
});
