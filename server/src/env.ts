function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function loadServerEnv() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseConfigured = Boolean(supabaseUrl && serviceRoleKey);

  const amadeusClientId = process.env.AMADEUS_CLIENT_ID;
  const amadeusClientSecret = process.env.AMADEUS_CLIENT_SECRET;
  const amadeusConfigured = Boolean(amadeusClientId && amadeusClientSecret);

  const duffelAccessToken = process.env.DUFFEL_ACCESS_TOKEN?.trim() || null;
  const duffelConfigured = Boolean(duffelAccessToken);

  const serpapiApiKey = process.env.SERPAPI_API_KEY?.trim() || null;
  const serpapiConfigured = Boolean(serpapiApiKey);

  /**
   * Comma-separated allowlist, or `*` for any origin.
   * For Apps in Toss QR / live (SDK 3.10), register the mini-app origins from
   * https://developers-apps-in-toss.toss.im/guide/en/operation/toss
   * (e.g. `*.private-apps.tossmini.com` / `*.apps.tossmini.com` hostnames
   * as shown in the console for this app — do not invent hostnames).
   */
  const corsOriginRaw = process.env.CORS_ORIGIN ?? '*';
  const corsOrigins =
    corsOriginRaw === '*'
      ? ('*' as const)
      : corsOriginRaw
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean);

  return {
    port: Number(process.env.PORT ?? 8787),
    corsOrigin: corsOriginRaw,
    corsOrigins,

    supabaseConfigured,
    supabaseUrl: supabaseConfigured ? required('SUPABASE_URL', supabaseUrl) : null,
    serviceRoleKey: supabaseConfigured
      ? required('SUPABASE_SERVICE_ROLE_KEY', serviceRoleKey)
      : null,

    /**
     * Official Amadeus OAuth body fields are `client_id` / `client_secret`
     * (API Key / API Secret from the Amadeus Self-Service dashboard).
     * https://github.com/amadeus4dev/developer-guides/blob/master/docs/quick-start.md
     */
    amadeusConfigured,
    amadeusClientId: amadeusConfigured
      ? required('AMADEUS_CLIENT_ID', amadeusClientId)
      : null,
    amadeusClientSecret: amadeusConfigured
      ? required('AMADEUS_CLIENT_SECRET', amadeusClientSecret)
      : null,
    /** test.api.amadeus.com (default) or api.amadeus.com */
    amadeusHostname: process.env.AMADEUS_HOSTNAME ?? 'test.api.amadeus.com',
    /** Display conversion only when Amadeus returns non-KRW (usually EUR). Not a live FX feed. */
    amadeusKrwPerEur: Number(process.env.AMADEUS_KRW_PER_EUR ?? 1500),

    /**
     * Duffel access token (server-only). Create in Dashboard → Developers → Access tokens.
     * Test tokens start with `duffel_test_`; live with `duffel_live_`. Do not mix modes.
     * https://duffel.com/docs/api/overview/making-requests
     * https://duffel.com/docs/api/overview/test-mode
     */
    duffelConfigured,
    duffelAccessToken: duffelConfigured
      ? required('DUFFEL_ACCESS_TOKEN', duffelAccessToken ?? undefined)
      : null,
    duffelBaseUrl: process.env.DUFFEL_BASE_URL ?? 'https://api.duffel.com',
    duffelApiVersion: process.env.DUFFEL_API_VERSION ?? 'v2',
    duffelTimeoutMs: Number(process.env.DUFFEL_TIMEOUT_MS ?? 12_000),

    /**
     * SerpApi API key (server-only). Used for Google Flights / Google Hotels search
     * in later migration steps. Never put SERPAPI_API_KEY in VITE_*.
     * https://serpapi.com/manage-api-key
     * Missing key does not block server startup — providers stay on Duffel/Amadeus/mock.
     */
    serpapiConfigured,
    serpapiApiKey: serpapiConfigured
      ? required('SERPAPI_API_KEY', serpapiApiKey ?? undefined)
      : null,
    serpapiBaseUrl: process.env.SERPAPI_BASE_URL ?? 'https://serpapi.com',
    serpapiTimeoutMs: Number(process.env.SERPAPI_TIMEOUT_MS ?? 15_000),
    /** Google locale / language / currency defaults for SerpApi engines (갈만해). */
    serpapiGl: process.env.SERPAPI_GL ?? 'kr',
    serpapiHl: process.env.SERPAPI_HL ?? 'ko',
    serpapiCurrency: process.env.SERPAPI_CURRENCY ?? 'KRW',

    flightCacheTtlMs: Number(process.env.FLIGHT_CACHE_TTL_MS ?? 15 * 60 * 1000),
    flightTimeoutMs: Number(process.env.FLIGHT_TIMEOUT_MS ?? 12_000),
    flightRateLimitPerMinute: Number(process.env.FLIGHT_RATE_LIMIT_PER_MINUTE ?? 30),

    /** Hotel List + Hotel Search (same Amadeus OAuth credentials). */
    accommodationCacheTtlMs: Number(process.env.ACCOMMODATION_CACHE_TTL_MS ?? 15 * 60 * 1000),
    accommodationTimeoutMs: Number(process.env.ACCOMMODATION_TIMEOUT_MS ?? 12_000),
    accommodationRateLimitPerMinute: Number(
      process.env.ACCOMMODATION_RATE_LIMIT_PER_MINUTE ?? 30,
    ),
    /** Max hotels from Hotel List to price via Hotel Search v3 */
    accommodationHotelIdLimit: Number(process.env.ACCOMMODATION_HOTEL_ID_LIMIT ?? 5),
  };
}

export type ServerEnv = ReturnType<typeof loadServerEnv>;
