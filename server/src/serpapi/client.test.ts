import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import type { ServerEnv } from '../env.js';
import { loadServerEnv } from '../env.js';
import { FlightSearchService, resolveActiveFlightProvider } from '../flights/service.js';
import {
  assertSerpapiConfigured,
  describeSerpapiClient,
  serpapiGet,
} from './client.js';
import { SerpapiApiError } from './errors.js';

const SECRET_KEY = 'serpapi_test_secret_key_do_not_leak';

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
    serpapiApiKey: SECRET_KEY,
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

function mockJsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: { get: () => null },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

function assertNoSecret(value: string) {
  assert.equal(value.includes(SECRET_KEY), false);
  assert.equal(value.toLowerCase().includes('api_key='), false);
}

afterEach(() => {
  mock.restoreAll();
});

describe('SerpApi HTTP client (mocked fetch)', () => {
  it('1. successful JSON response', async () => {
    mock.method(globalThis, 'fetch', async () =>
      mockJsonResponse(200, { search_metadata: { status: 'Success' }, best_flights: [] }),
    );
    const body = await serpapiGet(baseEnv(), {
      engine: 'google_flights',
      departure_id: 'ICN',
      arrival_id: 'KIX',
    });
    assert.equal((body.search_metadata as { status: string }).status, 'Success');
    assert.deepEqual(body.best_flights, []);
  });

  it('2. API key is added to the outgoing request', async () => {
    let capturedUrl = '';
    mock.method(globalThis, 'fetch', async (url: string | URL) => {
      capturedUrl = String(url);
      return mockJsonResponse(200, { ok: true });
    });
    await serpapiGet(baseEnv(), { engine: 'google_flights', departure_id: 'ICN' });
    const parsed = new URL(capturedUrl);
    assert.equal(parsed.origin, 'https://serpapi.com');
    assert.equal(parsed.pathname, '/search');
    assert.equal(parsed.searchParams.get('api_key'), SECRET_KEY);
    assert.equal(parsed.searchParams.get('engine'), 'google_flights');
    assert.equal(parsed.searchParams.get('departure_id'), 'ICN');
  });

  it('3. API key never appears in error messages', async () => {
    mock.method(globalThis, 'fetch', async () =>
      mockJsonResponse(401, { error: `Invalid API key: ${SECRET_KEY}` }),
    );
    await assert.rejects(
      () => serpapiGet(baseEnv(), { engine: 'google_hotels', q: 'Osaka' }),
      (error: unknown) => {
        assert.ok(error instanceof SerpapiApiError);
        assertNoSecret(error.message);
        assertNoSecret(JSON.stringify(error.toJSON()));
        return true;
      },
    );

    // Upstream echoed the key in the error string — we still surface their message,
    // but our constructed fields (path/engine) must not embed the query string.
    // Redact check: ensure we never put the request URL (with api_key) into the message.
    mock.restoreAll();
    mock.method(globalThis, 'fetch', async () => mockJsonResponse(500, { error: 'boom' }));
    await assert.rejects(
      () => serpapiGet(baseEnv(), { engine: 'google_flights' }),
      (error: unknown) => {
        assert.ok(error instanceof SerpapiApiError);
        assertNoSecret(error.message);
        assert.equal(error.message.includes('serpapi.com/search?'), false);
        return true;
      },
    );
  });

  it('4. missing API key → typed missing_config error', async () => {
    const env = baseEnv({ serpapiConfigured: false, serpapiApiKey: null });
    assert.throws(
      () => assertSerpapiConfigured(env),
      (error: unknown) => {
        assert.ok(error instanceof SerpapiApiError);
        assert.equal(error.kind, 'missing_config');
        assert.equal(error.status, 503);
        assertNoSecret(error.message);
        return true;
      },
    );
    await assert.rejects(
      () => serpapiGet(env, { engine: 'google_flights' }),
      (error: unknown) => {
        assert.ok(error instanceof SerpapiApiError);
        assert.equal(error.kind, 'missing_config');
        return true;
      },
    );
  });

  it('5. HTTP 401 / 403 / 500 → typed http errors', async () => {
    for (const status of [401, 403, 500]) {
      mock.restoreAll();
      mock.method(globalThis, 'fetch', async () =>
        mockJsonResponse(status, { error: `status ${status}` }),
      );
      await assert.rejects(
        () => serpapiGet(baseEnv(), { engine: 'google_flights' }),
        (error: unknown) => {
          assert.ok(error instanceof SerpapiApiError);
          assert.equal(error.kind, 'http');
          assert.equal(error.status, status);
          assert.match(error.message, new RegExp(String(status)));
          assertNoSecret(error.message);
          return true;
        },
      );
    }
  });

  it('6. SerpApi error payload on HTTP 200 → typed api error', async () => {
    mock.method(globalThis, 'fetch', async () =>
      mockJsonResponse(200, { error: 'Google Flights hasn\'t returned any results for this query.' }),
    );
    // Note: product empty-results often omit `error`; when SerpApi sets `error`, treat as API failure.
    await assert.rejects(
      () => serpapiGet(baseEnv(), { engine: 'google_flights' }),
      (error: unknown) => {
        assert.ok(error instanceof SerpapiApiError);
        assert.equal(error.kind, 'api');
        assert.match(error.message, /API error/);
        assertNoSecret(error.message);
        return true;
      },
    );
  });

  it('7. invalid JSON → typed invalid_json (distinct from empty results)', async () => {
    mock.method(globalThis, 'fetch', async () => mockJsonResponse(200, 'not-json<<<'));
    await assert.rejects(
      () => serpapiGet(baseEnv(), { engine: 'google_hotels', q: 'Tokyo' }),
      (error: unknown) => {
        assert.ok(error instanceof SerpapiApiError);
        assert.equal(error.kind, 'invalid_json');
        assertNoSecret(error.message);
        return true;
      },
    );

    mock.restoreAll();
    mock.method(globalThis, 'fetch', async () =>
      mockJsonResponse(200, { best_flights: [], other_flights: [] }),
    );
    const emptyOk = await serpapiGet(baseEnv(), { engine: 'google_flights' });
    assert.deepEqual(emptyOk.best_flights, []);
    assert.equal('error' in emptyOk, false);
  });

  it('8. timeout → typed timeout error', async () => {
    mock.method(globalThis, 'fetch', async () => {
      const err = new Error('The operation was aborted due to timeout');
      err.name = 'TimeoutError';
      throw err;
    });
    await assert.rejects(
      () => serpapiGet(baseEnv({ serpapiTimeoutMs: 10 }), { engine: 'google_flights' }),
      (error: unknown) => {
        assert.ok(error instanceof SerpapiApiError);
        assert.equal(error.kind, 'timeout');
        assert.equal(error.status, 504);
        assert.match(error.message, /timed out/);
        assertNoSecret(error.message);
        return true;
      },
    );
  });

  it('9. supports google_flights and google_hotels engines', async () => {
    const engines: Array<'google_flights' | 'google_hotels'> = [
      'google_flights',
      'google_hotels',
    ];
    for (const engine of engines) {
      mock.restoreAll();
      let captured = '';
      mock.method(globalThis, 'fetch', async (url: string | URL) => {
        captured = String(url);
        return mockJsonResponse(200, { engine });
      });
      const body = await serpapiGet(baseEnv(), {
        engine,
        ...(engine === 'google_hotels' ? { q: 'Osaka hotel' } : { departure_id: 'ICN' }),
      });
      assert.equal(body.engine, engine);
      assert.equal(new URL(captured).searchParams.get('engine'), engine);
    }
  });

  it('10. missing SerpApi config does not break unrelated server behavior', () => {
    const prev = process.env.SERPAPI_API_KEY;
    delete process.env.SERPAPI_API_KEY;
    try {
      const env = loadServerEnv();
      assert.equal(env.serpapiConfigured, false);
      assert.equal(env.serpapiApiKey, null);
      assert.equal(env.serpapiBaseUrl, 'https://serpapi.com');
      assert.equal(env.serpapiGl, 'kr');
      assert.equal(env.serpapiHl, 'ko');
      assert.equal(env.serpapiCurrency, 'KRW');

      const info = describeSerpapiClient(env);
      assert.equal(info.configured, false);
      assert.equal(JSON.stringify(info).includes('YOUR_'), false);

      // Flight selection still Duffel → Amadeus → mock (SerpApi not wired yet).
      assert.equal(
        resolveActiveFlightProvider(baseEnv({ serpapiConfigured: false, serpapiApiKey: null })),
        'mock',
      );
      assert.equal(
        resolveActiveFlightProvider(
          baseEnv({
            serpapiConfigured: true,
            serpapiApiKey: SECRET_KEY,
            duffelConfigured: true,
            duffelAccessToken: 'duffel_test_x',
          }),
        ),
        'duffel',
      );

      const service = new FlightSearchService(
        baseEnv({
          serpapiConfigured: false,
          serpapiApiKey: null,
          duffelConfigured: false,
          duffelAccessToken: null,
        }),
        null,
      );
      assert.ok(service);
    } finally {
      if (prev === undefined) {
        delete process.env.SERPAPI_API_KEY;
      } else {
        process.env.SERPAPI_API_KEY = prev;
      }
    }
  });
});
